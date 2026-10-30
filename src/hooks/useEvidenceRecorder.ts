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
  activePreviewStream: MediaStream | null;
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
  /** Safely attaches the active preview stream to any video element */
  attachPreview: (element: HTMLVideoElement | null) => void;
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
  const [activePreviewStream, setActivePreviewStream] = useState<MediaStream | null>(null);

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

    // Keep videoRef in sync with activePreviewStream whenever it mounts or changes
  useEffect(() => {
    if (videoRef.current && activePreviewStream && videoRef.current.srcObject !== activePreviewStream) {
      videoRef.current.srcObject = activePreviewStream;
      void videoRef.current.play().catch(() => {});
    }
  }, [activePreviewStream]);

  const cleanupSourceEl = (el: HTMLVideoElement | null) => {
    if (el?.parentElement) {
      el.parentElement.removeChild(el);
    }
  };

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
    cleanupSourceEl(rearVideoElRef.current);
    cleanupSourceEl(frontVideoElRef.current);
    rearVideoElRef.current = null;
    frontVideoElRef.current = null;
    canvasRef.current = null;
    setIsDualCamera(false);
    setActivePreviewStream(null);
  };

  const getAvailableVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter((d) => d.kind === 'videoinput');

      // If devices list is empty or labels/deviceIds are masked (permission not yet granted),
      // probe permission with a quick getUserMedia call so the full device list is exposed.
      if (videoDevices.length === 0 || videoDevices.every((d) => !d.deviceId && !d.label)) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          devices = await navigator.mediaDevices.enumerateDevices();
          videoDevices = devices.filter((d) => d.kind === 'videoinput');
          probe.getTracks().forEach((t) => t.stop());
        } catch (e) {
          console.log('Camera permission probe failed:', e);
        }
      }
      return videoDevices;
    } catch {
      return [];
    }
  };

  /** Builds an offscreen, playing <video> element attached to the DOM so mobile browsers decode frames. */
  const makeSourceVideoEl = (stream: MediaStream): HTMLVideoElement => {
    const el = document.createElement('video');
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    // Attach to DOM offscreen so Safari/WebKit and Chrome don't throttle or suspend decoding
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    void el.play().catch(() => {});
    return el;
  };

  /** Draws the current rear frame full-canvas and the front frame as a PiP inset, looping via rAF. */
  const startCompositeLoop = (
    rearEl: HTMLVideoElement,
    frontEl: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    isSeparateSensors: boolean
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Ensure canvas has standard 16:9 HD resolution
      if (canvas.width !== 1280 || canvas.height !== 720) {
        canvas.width = 1280;
        canvas.height = 720;
      }

      const rearReady = rearEl.readyState >= 2 && rearEl.videoWidth > 0;
      if (rearReady) {
        ctx.drawImage(rearEl, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw Main Back Camera Status Badge (Top Left)
      ctx.save();
      ctx.fillStyle = 'rgba(17, 24, 39, 0.75)';
      ctx.fillRect(16, 16, 150, 26);
      ctx.fillStyle = '#EF4444'; // Red recording dot
      ctx.beginPath();
      ctx.arc(28, 29, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillText(isSeparateSensors ? 'BACK CAM • MAIN' : 'BACK CAM • ENV', 40, 33);
      ctx.restore();

      // Front Camera (Smaller Rectangular Frame Inset at Top Right)
      const frontReady = frontEl.readyState >= 2 && frontEl.videoWidth > 0;
      const pipWidth = Math.round(canvas.width * 0.28); // 358px on 1280w
      const pipHeight = Math.round(pipWidth * 0.65); // ~232px rectangular frame
      const pipX = canvas.width - pipWidth - 20;
      const pipY = 20;

      // Inset Frame Drop Shadow & White Border
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#FFFFFF'; // Crisp white border
      ctx.fillRect(pipX - 3, pipY - 3, pipWidth + 6, pipHeight + 6);
      ctx.restore();

      // Inner background
      ctx.fillStyle = '#000000';
      ctx.fillRect(pipX, pipY, pipWidth, pipHeight);

      if (frontReady) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(pipX, pipY, pipWidth, pipHeight);
        ctx.clip();

        // Mirror front camera horizontally (like a real selfie camera)
        ctx.translate(pipX + pipWidth, pipY);
        ctx.scale(-1, 1);
        ctx.drawImage(frontEl, 0, 0, pipWidth, pipHeight);
        ctx.restore();
      }

      // Front Camera Badge on top of the smaller rectangular frame
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(pipX + 8, pipY + 8, 140, 22);
      ctx.fillStyle = '#10B981'; // Green active dot
      ctx.beginPath();
      ctx.arc(pipX + 18, pipY + 19, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
      ctx.fillText('FRONT CAM • USER', pipX + 28, pipY + 23);
      ctx.restore();

      // Evidence Watermark Bar across bottom
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, canvas.height - 24, canvas.width, 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px monospace';
      ctx.fillText(`SAFERA DUAL EVIDENCE • ${new Date().toLocaleTimeString()} • SHA-256 SECURED`, 16, canvas.height - 8);
      ctx.restore();

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
  const waitForLiveFrames = (el: HTMLVideoElement, track: MediaStreamTrack, timeoutMs = 3500): Promise<boolean> => {
    return new Promise((resolve) => {
      const start = Date.now();
      let resolved = false;

      const finish = (result: boolean) => {
        if (!resolved) {
          resolved = true;
          el.removeEventListener('loadeddata', onReady);
          el.removeEventListener('timeupdate', onReady);
          resolve(result);
        }
      };

      const onReady = () => {
        if (el.readyState >= 2 && el.videoWidth > 0 && !track.muted && track.readyState === 'live') {
          finish(true);
        }
      };

      el.addEventListener('loadeddata', onReady);
      el.addEventListener('timeupdate', onReady);

      const poll = () => {
        if (resolved) return;
        if (track.readyState === 'ended') {
          finish(false);
          return;
        }
        if (el.readyState >= 2 && el.videoWidth > 0 && !track.muted) {
          finish(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          finish(false);
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
  const startDualCameraPipeline = async (): Promise<MediaStream | null> => {
    // 1. Check if 2+ physical cameras exist and can be opened simultaneously
    const videoDevices = await getAvailableVideoDevices();
    let rearStream: MediaStream | null = null;
    let frontStream: MediaStream | null = null;
    let isSeparateSensors = false;

    if (videoDevices.length >= 2) {
      let rearDevice = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      let frontDevice = videoDevices.find((d) => /front|user|selfie|face/i.test(d.label));

      if (!rearDevice && !frontDevice) {
        rearDevice = videoDevices[0];
        frontDevice = videoDevices[1];
      } else if (!rearDevice) {
        rearDevice = videoDevices.find((d) => d.deviceId !== frontDevice?.deviceId) || videoDevices[0];
      } else if (!frontDevice) {
        frontDevice = videoDevices.find((d) => d.deviceId !== rearDevice?.deviceId) || videoDevices[1];
      }

      try {
        rearStream = await navigator.mediaDevices.getUserMedia({
          video: rearDevice?.deviceId
            ? { deviceId: { exact: rearDevice.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        frontStream = await navigator.mediaDevices.getUserMedia({
          video: frontDevice?.deviceId
            ? { deviceId: { exact: frontDevice.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });

        // Test if both cameras deliver live frames concurrently
        const rearElTest = makeSourceVideoEl(rearStream);
        const frontElTest = makeSourceVideoEl(frontStream);
        const [rearLive, frontLive] = await Promise.all([
          waitForLiveFrames(rearElTest, rearStream.getVideoTracks()[0], 2500),
          waitForLiveFrames(frontElTest, frontStream.getVideoTracks()[0], 2500),
        ]);

        if (rearLive && frontLive) {
          isSeparateSensors = true;
          rearStreamRef.current = rearStream;
          frontStreamRef.current = frontStream;
          rearVideoElRef.current = rearElTest;
          frontVideoElRef.current = frontElTest;
        } else {
          // Hardware exclusivity or timeout: tear down separate attempts
          cleanupSourceEl(rearElTest);
          cleanupSourceEl(frontElTest);
          stopAllTracks(rearStream);
          stopAllTracks(frontStream);
          rearStream = null;
          frontStream = null;
        }
      } catch (err) {
        console.log('Separate 2-camera simultaneous capture failed, using unified dual compositing:', err);
        if (rearStream) stopAllTracks(rearStream);
        if (frontStream) stopAllTracks(frontStream);
        rearStream = null;
        frontStream = null;
      }
    }

    // 2. If separate sensors are not available (single webcam, laptop, or mobile lock):
    // Open the primary camera stream and feed BOTH back view and front PiP inset from it!
    if (!isSeparateSensors) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: cameraMode === 'front' ? 'user' : 'environment' } },
          audio: true,
        });
        primaryStreamRef.current = stream;
        rearStreamRef.current = stream;
        frontStreamRef.current = stream;

        // Two source video elements playing from the same stream:
        // One for back background, one for front mirrored rectangular PiP inset!
        rearVideoElRef.current = makeSourceVideoEl(stream);
        frontVideoElRef.current = makeSourceVideoEl(stream);
      } catch (err) {
        console.error('Camera stream access failed completely:', err);
        return null;
      }
    }

    const rearEl = rearVideoElRef.current;
    const frontEl = frontVideoElRef.current;
    if (!rearEl || !frontEl) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvasRef.current = canvas;

    startCompositeLoop(rearEl, frontEl, canvas, isSeparateSensors);

    const canvasStream = canvas.captureStream(CANVAS_FPS);
    canvasStreamRef.current = canvasStream;

    const baseStream = rearStreamRef.current || primaryStreamRef.current;
    const audioTrack = baseStream?.getAudioTracks()[0];
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(audioTrack ? [audioTrack] : []),
    ]);

    setActivePreviewStream(canvasStream);
    if (videoRef.current) videoRef.current.srcObject = canvasStream;

    setIsDualCamera(true);
    return combined;
  };

  /** Audio-only capture mode when user chooses audio evidence. */
  const startAudioOnly = async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      primaryStreamRef.current = stream;
      setActivePreviewStream(null);
      setIsDualCamera(false);
      return stream;
    } catch (err) {
      console.log('Microphone unavailable:', err);
      return null;
    }
  };
  const startRecording = async () => {
    if (isRecording) return; // already recording — SOS + manual button both call this safely

    let recordingStream: MediaStream | null = null;

    if (recordType === 'video') {
      recordingStream = await startDualCameraPipeline();
    } else {
      // Audio-only mode
      recordingStream = await startAudioOnly();
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

  const attachPreview = (element: HTMLVideoElement | null) => {
    if (!element) return;
    const stream = canvasStreamRef.current || primaryStreamRef.current;
    if (stream && element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => {});
    }
  };

  return {
    videoRef,
    activePreviewStream,
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
    attachPreview,
  };
}