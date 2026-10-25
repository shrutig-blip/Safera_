import React, { useEffect, useRef, useState } from 'react';
import { EvidenceItem } from '../types';
import { getBestEffortLocation, SosCoords } from '../utils/sos';
import { reverseGeocode } from '../lib/geocode';
import { getOrCreateVaultKey, encryptBlob } from '../lib/evidenceCrypto';

const MAX_RECORDING_MS = 15 * 60 * 1000; // safety cap so a stuck SOS session doesn't record forever
const PIP_WIDTH_RATIO = 0.3; // front-camera inset width as a fraction of the composited canvas width
const PIP_MARGIN_PX = 16;
const CANVAS_FPS = 30;

export interface EvidenceRecorderState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
  isSaving: boolean;
  recordSeconds: number;
  cameraMode: 'front' | 'rear';
  setCameraMode: (mode: 'front' | 'rear') => void;
  recordType: 'video' | 'audio';
  setRecordType: (type: 'video' | 'audio') => void;
  /** True once a recording session has actually captured both cameras and is compositing them live. */
  isDualCamera: boolean;
  recordingCoords: SosCoords | null;
  recordingLocationName: string | null;
  /** Starts capture immediately. Safe to call from any tab (SOS dialog, vault UI, sensors, etc). */
  startRecording: () => Promise<void>;
  /** Stops capture, encrypts the result, uploads it, and saves it to the vault. */
  stopRecording: () => Promise<void>;
}

/**
 * Runs the camera/mic capture + encryption + upload pipeline at the app
 * root (mounted once in App.tsx), not inside EvidenceVault.tsx — so an
 * SOS trigger can start recording no matter which tab is currently open.
 * EvidenceVault.tsx just displays/controls this shared state instead of
 * owning its own separate MediaRecorder instance.
 *
 * Dual-camera capture: when the device exposes 2+ video inputs, we open
 * front and rear simultaneously and composite them onto an offscreen
 * canvas (rear full-frame, front as a picture-in-picture inset) so a
 * single recorded file has both angles — this can't be defeated by an
 * attacker just covering one lens. If only one camera is available, or a
 * getUserMedia() call for one of them fails, we fall back cleanly to the
 * previous single-camera behavior driven by `cameraMode`.
 */
export function useEvidenceRecorder(onSaved: (item: EvidenceItem) => void): EvidenceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cameraMode, setCameraMode] = useState<'front' | 'rear'>('front');
  const [recordType, setRecordType] = useState<'video' | 'audio'>('video');
  const [isDualCamera, setIsDualCamera] = useState(false);
  const [recordingCoords, setRecordingCoords] = useState<SosCoords | null>(null);
  const [recordingLocationName, setRecordingLocationName] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Raw camera streams. In dual mode both are populated; in single-camera
  // fallback only `primaryStreamRef` is used, exactly like the old hook.
  const rearStreamRef = useRef<MediaStream | null>(null);
  const frontStreamRef = useRef<MediaStream | null>(null);
  const primaryStreamRef = useRef<MediaStream | null>(null);

  // Offscreen <video> elements feeding the canvas compositor. Not mounted
  // in the DOM tree — created and driven entirely inside this hook.
  const rearVideoElRef = useRef<HTMLVideoElement | null>(null);
  const frontVideoElRef = useRef<HTMLVideoElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const drawLoopIdRef = useRef<number | null>(null);

  // The stream actually fed into MediaRecorder — either the raw single
  // camera stream, or [compositedCanvasVideoTrack + oneAudioTrack].
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {});

  // Live timer while recording
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => setRecordSeconds((prev) => prev + 1), 1000);
    } else {
      setRecordSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const stopAllTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const stopCamera = () => {
    if (drawLoopIdRef.current !== null) {
      cancelAnimationFrame(drawLoopIdRef.current);
      drawLoopIdRef.current = null;
    }
    stopAllTracks(rearStreamRef.current);
    stopAllTracks(frontStreamRef.current);
    stopAllTracks(primaryStreamRef.current);
    stopAllTracks(canvasStreamRef.current);
    rearStreamRef.current = null;
    frontStreamRef.current = null;
    primaryStreamRef.current = null;
    canvasStreamRef.current = null;
    recordingStreamRef.current = null;
    rearVideoElRef.current = null;
    frontVideoElRef.current = null;
    canvasRef.current = null;
    setIsDualCamera(false);
  };

  const countVideoInputs = async (): Promise<number> => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return 1;
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput').length;
    } catch {
      return 1; // if we can't tell, assume single-camera and let the dual attempt fail gracefully anyway
    }
  };

  /** Builds a hidden, playing <video> element sourced from a given stream, used only as a canvas draw source. */
  const makeSourceVideoEl = (stream: MediaStream): HTMLVideoElement => {
    const el = document.createElement('video');
    el.srcObject = stream;
    el.muted = true; // never let these play audio out loud — audio is carried separately on the recording stream
    el.playsInline = true;
    el.autoplay = true;
    void el.play().catch(() => {
      // Autoplay can be blocked before a user gesture on some browsers;
      // the draw loop just skips frames until playback actually starts.
    });
    return el;
  };

  /** Draws the current rear frame full-canvas and the front frame as a PiP inset, looping via rAF. */
  const startCompositeLoop = (rearEl: HTMLVideoElement, frontEl: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rearReady = rearEl.readyState >= 2 && rearEl.videoWidth > 0;
      if (rearReady && (canvas.width !== rearEl.videoWidth || canvas.height !== rearEl.videoHeight)) {
        canvas.width = rearEl.videoWidth;
        canvas.height = rearEl.videoHeight;
      }

      if (rearReady) {
        ctx.drawImage(rearEl, 0, 0, canvas.width, canvas.height);
      } else {
        // Rear feed not ready yet this frame — avoid leaving stale/garbage pixels.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const frontReady = frontEl.readyState >= 2 && frontEl.videoWidth > 0;
      if (frontReady && canvas.width > 0) {
        const pipWidth = canvas.width * PIP_WIDTH_RATIO;
        const pipHeight = pipWidth * (frontEl.videoHeight / frontEl.videoWidth);
        const pipX = canvas.width - pipWidth - PIP_MARGIN_PX;
        const pipY = canvas.height - pipHeight - PIP_MARGIN_PX;

        ctx.save();
        // Thin border so the inset reads clearly against busy rear-camera footage.
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(pipX - 3, pipY - 3, pipWidth + 6, pipHeight + 6);
        // Front camera is mirrored, matching how the user sees themselves live.
        ctx.translate(pipX + pipWidth, pipY);
        ctx.scale(-1, 1);
        ctx.drawImage(frontEl, 0, 0, pipWidth, pipHeight);
        ctx.restore();
      }

      drawLoopIdRef.current = requestAnimationFrame(draw);
    };

    drawLoopIdRef.current = requestAnimationFrame(draw);
  };

  /**
   * Waits for a source <video> element to actually be delivering frames
   * (readyState past HAVE_CURRENT_DATA and a real videoWidth) and for its
   * underlying track to still be live. Resolves false on timeout instead
   * of throwing, since a timeout here just means "this camera didn't pan
   * out" — not a hard error.
   */
  const waitForLiveFrames = (el: HTMLVideoElement, track: MediaStreamTrack, timeoutMs: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        if (track.readyState === 'ended') {
          resolve(false);
          return;
        }
        if (el.readyState >= 2 && el.videoWidth > 0 && !track.muted) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(poll);
      };
      poll();
    });
  };

  /**
   * Tries to open both cameras at once. Returns null if dual capture isn't
   * viable, so the caller can fall back. This does more than count video
   * input devices: on most phones (iOS Safari especially, plus a lot of
   * Android browsers/hardware) the camera stack only supports ONE active
   * camera stream at a time. In that case the second getUserMedia() call
   * often does NOT throw — instead the OS silently reclaims the first
   * camera, so its track goes muted/ended a moment later while the second
   * keeps working. That shows up as "front still records, rear doesn't."
   * To catch that, we open both, then actually wait for live frames on
   * both before committing — if either one doesn't pan out, we tear
   * everything down and let the caller fall back to single-camera mode.
   */
  const tryStartDualCamera = async (): Promise<MediaStream | null> => {
    const inputCount = await countVideoInputs();
    if (inputCount < 2) return null;

    let rearStream: MediaStream;
    try {
      rearStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' } },
        audio: true,
      });
    } catch (err) {
      console.log('Rear camera unavailable for dual capture:', err);
      return null;
    }

    let frontStream: MediaStream;
    try {
      frontStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'user' } },
        audio: false, // single shared audio track (from the rear stream) avoids echo/double-mic issues
      });
    } catch (err) {
      console.log('Front camera unavailable for dual capture, falling back to single camera:', err);
      stopAllTracks(rearStream);
      return null;
    }

    const rearEl = makeSourceVideoEl(rearStream);
    const frontEl = makeSourceVideoEl(frontStream);

    const rearTrack = rearStream.getVideoTracks()[0];
    const frontTrack = frontStream.getVideoTracks()[0];

    // Warm-up: confirm both cameras are genuinely delivering frames
    // simultaneously before treating this as real dual capture. On a
    // device that can only run one camera at a time, this is where that
    // gets caught — rearTrack goes muted/ended once frontStream opens.
    const [rearLive, frontLive] = await Promise.all([
      waitForLiveFrames(rearEl, rearTrack, 1500),
      waitForLiveFrames(frontEl, frontTrack, 1500),
    ]);

    if (!rearLive || !frontLive) {
      console.log(
        `Dual camera warm-up failed (rear live: ${rearLive}, front live: ${frontLive}) — this device likely only supports one active camera stream. Falling back to single camera.`,
      );
      stopAllTracks(rearStream);
      stopAllTracks(frontStream);
      return null;
    }

    rearStreamRef.current = rearStream;
    frontStreamRef.current = frontStream;
    rearVideoElRef.current = rearEl;
    frontVideoElRef.current = frontEl;

    // Keep watching after commit: if the OS reclaims a camera mid-recording
    // (some devices allow a brief dual window before enforcing exclusivity),
    // at least surface it loudly instead of silently recording a dead frame.
    rearTrack.addEventListener('mute', () => console.warn('Rear camera track muted mid-recording — device may have reclaimed the camera.'));
    rearTrack.addEventListener('ended', () => console.warn('Rear camera track ended mid-recording.'));
    frontTrack.addEventListener('mute', () => console.warn('Front camera track muted mid-recording — device may have reclaimed the camera.'));
    frontTrack.addEventListener('ended', () => console.warn('Front camera track ended mid-recording.'));

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvasRef.current = canvas;

    startCompositeLoop(rearEl, frontEl, canvas);

    const canvasStream = canvas.captureStream(CANVAS_FPS);
    canvasStreamRef.current = canvasStream;

    const audioTrack = rearStream.getAudioTracks()[0];
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(audioTrack ? [audioTrack] : []),
    ]);

    // Live preview shows the actual composited picture-in-picture feed.
    if (videoRef.current) videoRef.current.srcObject = canvasStream;

    setIsDualCamera(true);
    return combined;
  };

  /** Original single-camera path, used when dual capture isn't available or fails. */
  const startSingleCamera = async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: recordType === 'video' ? { facingMode: cameraMode === 'front' ? 'user' : 'environment' } : false,
        audio: true,
      });
      primaryStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsDualCamera(false);
      return stream;
    } catch (err) {
      console.log('Camera permission or availability:', err);
      return null;
    }
  };

  /**
   * Fallback path specifically for when a dual-camera attempt didn't pan
   * out. Tries the rear camera first regardless of the current
   * `cameraMode` toggle — rear is the primary evidence angle — then falls
   * back to front if rear genuinely isn't available (e.g. front-only
   * devices, or a permission prompt only granted for one lens).
   */
  const startSingleCameraPreferRear = async (): Promise<MediaStream | null> => {
    const attempts: Array<'rear' | 'front'> = ['rear', 'front'];
    for (const mode of attempts) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return null;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode === 'front' ? 'user' : 'environment' },
          audio: true,
        });
        primaryStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraMode(mode);
        setIsDualCamera(false);
        return stream;
      } catch (err) {
        console.log(`${mode} camera unavailable during dual-capture fallback:`, err);
      }
    }
    return null;
  };

  const startRecording = async () => {
    if (isRecording) return; // already recording — SOS + manual button both call this safely

    let recordingStream: MediaStream | null = null;

    if (recordType === 'video') {
      recordingStream = await tryStartDualCamera();
      if (!recordingStream) {
        recordingStream = await startSingleCameraPreferRear();
      }
    } else {
      // Audio-only mode never needs dual camera compositing.
      recordingStream = await startSingleCamera();
    }

    recordingStreamRef.current = recordingStream;

    setRecordingCoords(null);
    setRecordingLocationName(null);
    getBestEffortLocation().then(async (fix) => {
      setRecordingCoords(fix);
      if (fix) {
        const name = await reverseGeocode(fix.lat, fix.lng);
        setRecordingLocationName(name);
      }
    });

    recordedChunksRef.current = [];
    if (recordingStream && 'MediaRecorder' in window) {
      try {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
        const recorder = mimeType
          ? new MediaRecorder(recordingStream, { mimeType })
          : new MediaRecorder(recordingStream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch (err) {
        console.log('MediaRecorder unavailable, falling back to metadata-only capture:', err);
        mediaRecorderRef.current = null;
      }
    }

    setIsRecording(true);

    // Safety cap — an SOS session that's never manually stopped still
    // finalizes and uploads instead of recording indefinitely.
    if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
    maxDurationTimeoutRef.current = setTimeout(() => {
      void stopRecordingRef.current();
    }, MAX_RECORDING_MS);
  };

  const stopRecording = async () => {
    if (!isRecording && !mediaRecorderRef.current) return;

    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    const coordsAtStop = recordingCoords;
    const locationNameAtStop = recordingLocationName;
    const secondsAtStop = recordSeconds;
    const typeAtStop = recordType;
    const wasDualCamera = isDualCamera;

    const finalize = async (blob: Blob) => {
      setIsSaving(true);

      // Local playback/export URL — this is the user's own device, so
      // keeping a local plaintext blob for "Export" to keep working is
      // fine. What leaves the device (the upload below) is encrypted.
      const localUrl = blob.size > 0 ? URL.createObjectURL(blob) : '';

      let isCloudBackedUp = false;
      let isEncrypted = false;

      if (blob.size > 0) {
        try {
          const vaultKey = await getOrCreateVaultKey();
          const encrypted = await encryptBlob(vaultKey, blob);
          isEncrypted = true;

          const res = await fetch('/api/evidence/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: `Safera_${typeAtStop.toUpperCase()}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.webm`,
              mimeType: recorder?.mimeType || 'video/webm',
              encryptedBase64: encrypted.ciphertextBase64,
              ivBase64: encrypted.ivBase64,
              sha256Hash: encrypted.sha256Hash,
              capturedAt: new Date().toISOString(),
              lat: coordsAtStop?.lat ?? null,
              lng: coordsAtStop?.lng ?? null,
              dualCamera: wasDualCamera,
            }),
          });
          isCloudBackedUp = res.ok;
          if (!res.ok) {
            console.warn('Evidence upload failed with status', res.status);
          }
        } catch (err) {
          console.warn('Evidence encryption/upload failed, evidence stays local-only:', err);
        }
      }

      const newEntry: EvidenceItem = {
        id: `ev-${Date.now()}`,
        title: `Safera_${typeAtStop.toUpperCase()}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.webm`,
        type: typeAtStop,
        timestamp: new Date().toLocaleString(),
        locationName:
          locationNameAtStop || (coordsAtStop ? `${coordsAtStop.lat.toFixed(4)}, ${coordsAtStop.lng.toFixed(4)}` : 'Location unavailable'),
        coords: coordsAtStop ? { lat: coordsAtStop.lat, lng: coordsAtStop.lng } : { lat: 0, lng: 0 },
        duration: `00:${secondsAtStop < 10 ? '0' + secondsAtStop : secondsAtStop}`,
        fileSize: blob.size > 0 ? `${(blob.size / (1024 * 1024)).toFixed(1)} MB` : `${(secondsAtStop * 1.2 + 1.5).toFixed(1)} MB (estimated)`,
        mediaUrl: localUrl,
        isEncrypted,
        isCloudBackedUp,
      };

      onSaved(newEntry);
      stopCamera();
      setIsSaving(false);
    };

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        void finalize(blob);
        mediaRecorderRef.current = null;
      };
      recorder.stop();
    } else {
      // No MediaRecorder support (or camera permission was denied) — still
      // save a metadata-only entry rather than silently dropping the report.
      await finalize(new Blob());
    }
  };

  // Lets startRecording's setTimeout always call the *latest* stopRecording
  // (which closes over current state) without needing it in a dependency array.
  stopRecordingRef.current = stopRecording;

  return {
    videoRef,
    isRecording,
    isSaving,
    recordSeconds,
    cameraMode,
    setCameraMode,
    recordType,
    setRecordType,
    isDualCamera,
    recordingCoords,
    recordingLocationName,
    startRecording,
    stopRecording,
  };
}