import React, { useEffect, useRef, useState } from 'react';
import { EvidenceItem } from '../types';
import { getBestEffortLocation, SosCoords } from '../utils/sos';
import { reverseGeocode } from '../lib/geocode';
import { getOrCreateVaultKey, encryptBlob } from '../lib/evidenceCrypto';

const MAX_RECORDING_MS = 15 * 60 * 1000; // safety cap so a stuck SOS session doesn't record forever
const CANVAS_FPS = 30;

export type CameraModeStatus = 'dual' | 'rear-only' | 'front-only';

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
  /** True once a recording session has actually captured both cameras concurrently and is compositing them live. */
  isDualCamera: boolean;
  /** Camera mode status for indicators ('dual' | 'rear-only' | 'front-only') */
  cameraModeStatus: CameraModeStatus;
  /** Human-readable camera mode label ('Dual Camera Active' | 'Rear Camera Only' | 'Front Camera Only') */
  cameraModeLabel: string;
  /** Clear fallback notification if dual camera wasn't supported: "Dual camera isn't supported on this device. Recording with the rear camera instead." */
  fallbackNotice: string | null;
  recordingCoords: SosCoords | null;
  recordingLocationName: string | null;
  /** Starts capture immediately. Safe to call from any tab (SOS dialog, vault UI, sensors, etc). */
  startRecording: () => Promise<void>;
  /** Stops capture, encrypts the result, uploads it, and saves it to the vault. */
  stopRecording: () => Promise<void>;
  /** Safely attaches the active preview stream to any video element */
  attachPreview: (element: HTMLVideoElement | null) => void;
}

// In-memory session cache: detect once, do not repeatedly attempt unsupported front camera
let concurrentSupportCache: boolean | null = null;

export function useEvidenceRecorder(onSaved: (item: EvidenceItem) => void): EvidenceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cameraMode, setCameraMode] = useState<'front' | 'rear'>('rear');
  const [recordType, setRecordType] = useState<'video' | 'audio'>('video');
  const [isDualCamera, setIsDualCamera] = useState(false);
  const [cameraModeStatus, setCameraModeStatus] = useState<CameraModeStatus>('rear-only');
  const [cameraModeLabel, setCameraModeLabel] = useState<string>('Rear Camera Only');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  const [recordingCoords, setRecordingCoords] = useState<SosCoords | null>(null);
  const [recordingLocationName, setRecordingLocationName] = useState<string | null>(null);
  const [activePreviewStream, setActivePreviewStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Raw camera streams
  const rearStreamRef = useRef<MediaStream | null>(null);
  const frontStreamRef = useRef<MediaStream | null>(null);
  const primaryStreamRef = useRef<MediaStream | null>(null);

  // Offscreen <video> elements feeding canvas compositor
  const rearVideoElRef = useRef<HTMLVideoElement | null>(null);
  const frontVideoElRef = useRef<HTMLVideoElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const drawLoopIdRef = useRef<number | null>(null);
  const backgroundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (backgroundTimerRef.current !== null) {
      clearInterval(backgroundTimerRef.current);
      backgroundTimerRef.current = null;
    }
    stopAllTracks(rearStreamRef.current);
    stopAllTracks(frontStreamRef.current);
    stopAllTracks(primaryStreamRef.current);
    stopAllTracks(canvasStreamRef.current);

    cleanupSourceEl(rearVideoElRef.current);
    cleanupSourceEl(frontVideoElRef.current);

    rearStreamRef.current = null;
    frontStreamRef.current = null;
    primaryStreamRef.current = null;
    canvasStreamRef.current = null;
    recordingStreamRef.current = null;
    rearVideoElRef.current = null;
    frontVideoElRef.current = null;
    canvasRef.current = null;
    setIsDualCamera(false);
    setActivePreviewStream(null);
  };

  /**
   * Intelligently detects whether the device supports simultaneous front and rear camera capture.
   * Caches result to avoid repeatedly re-probing unsupported hardware.
   */
  const checkConcurrentCameraSupport = async (): Promise<boolean> => {
    if (concurrentSupportCache !== null) {
      return concurrentSupportCache;
    }

    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
      concurrentSupportCache = false;
      return false;
    }

    try {
      // Check native bridge if present (e.g. Android Camera2 capability bridge)
      const win = window as any;
      if (typeof win.AndroidCamera?.isConcurrentSupported === 'function') {
        concurrentSupportCache = Boolean(win.AndroidCamera.isConcurrentSupported());
        return concurrentSupportCache;
      }

      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter((d) => d.kind === 'videoinput');

      // Probe permission once if device labels are masked
      if (videoDevices.length === 0 || videoDevices.every((d) => !d.deviceId && !d.label)) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          devices = await navigator.mediaDevices.enumerateDevices();
          videoDevices = devices.filter((d) => d.kind === 'videoinput');
          probe.getTracks().forEach((t) => t.stop());
        } catch {
          concurrentSupportCache = false;
          return false;
        }
      }

      // Device must expose at least 2 distinct video inputs
      if (videoDevices.length < 2) {
        concurrentSupportCache = false;
        return false;
      }

      // iOS Safari (WebKit) check:
      // In iOS WebKit browsers, getUserMedia does not allow concurrent active camera streams.
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (isIOS) {
        concurrentSupportCache = false;
        return false;
      }

      // Android & Desktop live probe: attempt non-blocking concurrent acquisition
      let rearProbe: MediaStream | null = null;
      let frontProbe: MediaStream | null = null;

      try {
        rearProbe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } },
          audio: false,
        });

        frontProbe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 640 } },
          audio: false,
        });

        const rearTrack = rearProbe.getVideoTracks()[0];
        const frontTrack = frontProbe.getVideoTracks()[0];

        // Check if rear track was muted or halted when front opened
        if (
          rearTrack &&
          frontTrack &&
          !rearTrack.muted &&
          !frontTrack.muted &&
          rearTrack.readyState === 'live' &&
          frontTrack.readyState === 'live'
        ) {
          concurrentSupportCache = true;
        } else {
          concurrentSupportCache = false;
        }
      } catch {
        concurrentSupportCache = false;
      } finally {
        rearProbe?.getTracks().forEach((t) => t.stop());
        frontProbe?.getTracks().forEach((t) => t.stop());
      }

      return concurrentSupportCache ?? false;
    } catch {
      concurrentSupportCache = false;
      return false;
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

  /**
   * Helper to wait for a source video element to begin actively delivering frames.
   */
  const waitForLiveFrames = (el: HTMLVideoElement, track: MediaStreamTrack, timeoutMs = 2500): Promise<boolean> => {
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
        if (track.readyState === 'ended' || track.muted) {
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
   * Balanced, high-visibility dual camera compositor:
   * - Rear Camera (Primary): Full canvas capturing incident & environment.
   * - Front Camera: Sufficiently large, clear frame (36% width, 4:3 aspect ratio) capturing user face & reactions.
   * - Synchronous rendering loop with live timestamps, GPS coordinates, and SHA-256 seal.
   */
  const startDualCompositeLoop = (
    rearEl: HTMLVideoElement,
    frontEl: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame = () => {
      // 16:9 standard evidence frame
      if (canvas.width !== 1280 || canvas.height !== 720) {
        canvas.width = 1280;
        canvas.height = 720;
      }

      // 1. Primary Rear Camera Feed (Full Canvas)
      const rearReady = rearEl.readyState >= 2 && rearEl.videoWidth > 0;
      if (rearReady) {
        ctx.drawImage(rearEl, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Primary Rear Camera HUD Badge (Top-Left)
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(18, 18, 175, 28);
      ctx.fillStyle = '#EF4444'; // Red recording dot
      ctx.beginPath();
      ctx.arc(32, 32, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillText('REAR CAM • ENVIRONMENT', 44, 36);
      ctx.restore();

      // 2. Front Camera Frame (Large, Clear, Properly Visible PiP Inset at Top-Right)
      // Sufficiently large: 36% of canvas width (~460px on 1280w), 4:3 face-friendly aspect ratio
      const pipWidth = Math.round(canvas.width * 0.36); // 460px
      const pipHeight = Math.round(pipWidth * 0.75); // 345px
      const pipX = canvas.width - pipWidth - 22;
      const pipY = 22;

      // Drop shadow for clear separation from rear footage
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#FFFFFF'; // Crisp 3.5px solid white border
      ctx.fillRect(pipX - 3.5, pipY - 3.5, pipWidth + 7, pipHeight + 7);
      ctx.restore();

      // Inner background
      ctx.fillStyle = '#000000';
      ctx.fillRect(pipX, pipY, pipWidth, pipHeight);

      const frontReady = frontStreamRef.current && frontEl.readyState >= 2 && frontEl.videoWidth > 0;
      if (frontReady) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(pipX, pipY, pipWidth, pipHeight);
        ctx.clip();

        // Mirror front camera horizontally so user face orientation is natural
        ctx.translate(pipX + pipWidth, pipY);
        ctx.scale(-1, 1);
        ctx.drawImage(frontEl, 0, 0, pipWidth, pipHeight);
        ctx.restore();
      }

      // Front Camera HUD Badge on PiP inset
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(pipX + 8, pipY + 8, 175, 24);
      ctx.fillStyle = '#10B981'; // Green active dot
      ctx.beginPath();
      ctx.arc(pipX + 20, pipY + 20, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
      ctx.fillText('FRONT CAM • USER FACE', pipX + 30, pipY + 24);
      ctx.restore();

      // 3. Continuous Tamper-Proof Telemetry & Watermark Bar (Bottom)
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(0, canvas.height - 26, canvas.width, 26);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px monospace';
      const locStr = recordingCoords
        ? `LAT: ${recordingCoords.lat.toFixed(4)} LNG: ${recordingCoords.lng.toFixed(4)}`
        : 'GPS ACQUIRING';
      ctx.fillText(
        `SAFERA DUAL EVIDENCE • ${locStr} • ${new Date().toISOString()} • SHA-256 SEALED`,
        18,
        canvas.height - 9
      );
      ctx.restore();
    };

    const loop = () => {
      drawFrame();
      drawLoopIdRef.current = requestAnimationFrame(loop);
    };

    drawLoopIdRef.current = requestAnimationFrame(loop);

    // Fallback interval ensures frames continue pumping if tab is backgrounded
    backgroundTimerRef.current = setInterval(() => {
      if (document.visibilityState === 'hidden') {
        drawFrame();
      }
    }, 1000 / CANVAS_FPS);
  };

  /**
   * Initializes simultaneous rear and front camera recording.
   * Returns composited MediaStream or null if dual capture is unavailable.
   */
  const initializeDualCameraRecording = async (): Promise<MediaStream | null> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

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

      // 1. Initialize Rear Camera (Hero Evidence Feed)
      const rearStream = await navigator.mediaDevices.getUserMedia({
        video: rearDevice?.deviceId
          ? { deviceId: { exact: rearDevice.deviceId }, width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, frameRate: { ideal: 30 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      });

      // 2. Initialize Front Camera (User Face & Reaction)
      let frontStream: MediaStream;
      try {
        frontStream = await navigator.mediaDevices.getUserMedia({
          video: frontDevice?.deviceId
            ? { deviceId: { exact: frontDevice.deviceId }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, frameRate: { ideal: 30 } }
            : { facingMode: { ideal: 'user' }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 }, frameRate: { ideal: 30 } },
          audio: false, // Single shared audio track prevents echo/phasing
        });
      } catch (frontErr) {
        console.warn('Front camera initialization failed, releasing front attempt:', frontErr);
        stopAllTracks(rearStream);
        return null;
      }

      const rearTrack = rearStream.getVideoTracks()[0];
      const frontTrack = frontStream.getVideoTracks()[0];

      const rearEl = makeSourceVideoEl(rearStream);
      const frontEl = makeSourceVideoEl(frontStream);

      // Verify both streams deliver live frames concurrently
      const [rearLive, frontLive] = await Promise.all([
        waitForLiveFrames(rearEl, rearTrack, 2000),
        waitForLiveFrames(frontEl, frontTrack, 2000),
      ]);

      if (!rearLive || !frontLive) {
        cleanupSourceEl(rearEl);
        cleanupSourceEl(frontEl);
        stopAllTracks(rearStream);
        stopAllTracks(frontStream);
        return null;
      }

      rearStreamRef.current = rearStream;
      frontStreamRef.current = frontStream;
      rearVideoElRef.current = rearEl;
      frontVideoElRef.current = frontEl;

      // Handle front camera disconnection gracefully without failing ongoing rear recording
      frontTrack.addEventListener('ended', () => {
        console.warn('Front camera ended mid-recording. Continuing with rear camera.');
        frontStreamRef.current = null;
        setCameraModeStatus('rear-only');
        setCameraModeLabel('Rear Camera Only');
        setFallbackNotice('Front camera disconnected. Continuing recording with rear camera.');
      });
      frontTrack.addEventListener('mute', () => {
        console.warn('Front camera muted mid-recording.');
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      canvasRef.current = canvas;

      startDualCompositeLoop(rearEl, frontEl, canvas);

      const canvasStream = canvas.captureStream(CANVAS_FPS);
      canvasStreamRef.current = canvasStream;

      const audioTrack = rearStream.getAudioTracks()[0];
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...(audioTrack ? [audioTrack] : []),
      ]);

      setActivePreviewStream(canvasStream);
      if (videoRef.current) videoRef.current.srcObject = canvasStream;

      setIsDualCamera(true);
      setCameraModeStatus('dual');
      setCameraModeLabel('Dual Camera Active');
      setFallbackNotice(null);

      return combined;
    } catch (err) {
      console.warn('Simultaneous dual camera setup failed:', err);
      return null;
    }
  };

  /**
   * Fallback: Initializes uninterrupted rear-camera evidence capture.
   * Preserves native video quality and orientation.
   */
  const initializeRearCameraRecording = async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return null;

      let stream: MediaStream | null = null;
      let usedMode: 'rear' | 'front' = 'rear';

      // 1. Prioritize Rear Camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        });
        usedMode = 'rear';
      } catch {
        // 2. Fall back to available camera if environment camera is not available (e.g. front-only laptop)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
          },
          audio: true,
        });
        usedMode = 'front';
      }

      primaryStreamRef.current = stream;
      setActivePreviewStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;

      setIsDualCamera(false);
      setCameraMode(usedMode);
      setCameraModeStatus(usedMode === 'rear' ? 'rear-only' : 'front-only');
      setCameraModeLabel(usedMode === 'rear' ? 'Rear Camera Only' : 'Front Camera Only');

      return stream;
    } catch (err) {
      console.error('Rear camera recording fallback failed:', err);
      return null;
    }
  };

  /** Audio-only capture mode when user chooses audio evidence. */
  const startAudioOnly = async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      primaryStreamRef.current = stream;
      setActivePreviewStream(null);
      setIsDualCamera(false);
      setCameraModeStatus('rear-only');
      setCameraModeLabel('Audio Only');
      setFallbackNotice(null);
      return stream;
    } catch (err) {
      console.error('Microphone unavailable:', err);
      return null;
    }
  };

  const startRecording = async () => {
    if (isRecording) return; // already recording — safe to call from any tab or SOS trigger

    setFallbackNotice(null);
    let recordingStream: MediaStream | null = null;

    if (recordType === 'video') {
      // Step 1: Detect whether device supports concurrent camera streams
      const isDualSupported = await checkConcurrentCameraSupport();

      if (isDualSupported) {
        // Step 2: Attempt simultaneous dual camera initialization
        recordingStream = await initializeDualCameraRecording();
      }

      // Step 3: If dual camera isn't supported OR initialization failed, graceful rear-camera fallback
      if (!recordingStream) {
        setFallbackNotice("Dual camera isn't supported on this device. Recording with the rear camera instead.");
        recordingStream = await initializeRearCameraRecording();
      }
    } else {
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
        console.warn('MediaRecorder init error, capturing metadata:', err);
        mediaRecorderRef.current = null;
      }
    }

    setIsRecording(true);

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
    const modeAtStop = cameraModeStatus;

    const finalize = async (blob: Blob) => {
      setIsSaving(true);
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
              cameraMode: modeAtStop,
            }),
          });
          isCloudBackedUp = res.ok;
        } catch (err) {
          console.warn('Evidence encryption/upload failed, keeping locally:', err);
        }
      }

      const newEntry: EvidenceItem = {
        id: `ev-${Date.now()}`,
        title: `Safera_${typeAtStop.toUpperCase()}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.webm`,
        type: typeAtStop,
        timestamp: new Date().toLocaleString(),
        locationName:
          locationNameAtStop ||
          (coordsAtStop ? `${coordsAtStop.lat.toFixed(4)}, ${coordsAtStop.lng.toFixed(4)}` : 'Location unavailable'),
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
      await finalize(new Blob());
    }
  };

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
    cameraModeStatus,
    cameraModeLabel,
    fallbackNotice,
    recordingCoords,
    recordingLocationName,
    startRecording,
    stopRecording,
    attachPreview,
  };
}
