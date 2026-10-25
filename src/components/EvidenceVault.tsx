import React, { useState, useEffect } from 'react';
import { EvidenceItem } from '../types';
import { GuardIaLogo } from './GuardIaLogo';
import { EvidenceRecorderState } from '../hooks/useEvidenceRecorder';
import { hasVaultPin, setVaultPin, verifyVaultPin } from '../lib/auth';
import {
  Shield,
  Camera,
  Lock,
  Upload,
  CheckCircle2,
  Video,
  StopCircle,
  RefreshCw,
  Download,
  Key,
  ShieldCheck,
} from 'lucide-react';

interface EvidenceVaultProps {
  evidenceList: EvidenceItem[];
  /**
   * Shared recording engine from useEvidenceRecorder, mounted once in
   * App.tsx. This component no longer owns its own MediaRecorder/camera
   * refs — it reads and controls the same session that SOS can also
   * start, so recording that begins from an SOS trigger shows up here
   * live even if the user switches to this tab mid-recording.
   */
  recorder: EvidenceRecorderState;
}

export const EvidenceVault: React.FC<EvidenceVaultProps> = ({ evidenceList, recorder }) => {
  const {
    videoRef,
    isRecording,
    isSaving,
    recordSeconds,
    cameraMode,
    setCameraMode,
    recordingCoords,
    startRecording,
    stopRecording,
  } = recorder;

  const [isLocked, setIsLocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Whether this account has ever set a real vault PIN yet. `null` while
  // unknown (avoids flashing the wrong form for a frame), then resolved to
  // true/false once on mount.
  const [needsPinSetup, setNeedsPinSetup] = useState<boolean | null>(null);

  useEffect(() => {
    setNeedsPinSetup(!hasVaultPin());
  }, []);

  // Real PIN system: no hardcoded default, no blank-input bypass. First
  // visit asks the user to set their own 4-8 digit PIN (hashed the same
  // SHA-256 way the login password already is); every visit after that
  // requires the actual PIN to match.
  const handleSetupPin = async () => {
    setPinError(null);
    if (pinInput !== pinConfirmInput) {
      setPinError('PINs do not match.');
      return;
    }
    setIsVerifyingPin(true);
    try {
      await setVaultPin(pinInput);
      setNeedsPinSetup(false);
      setIsLocked(false);
      setPinInput('');
      setPinConfirmInput('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Could not set PIN. Please try again.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleUnlockVault = async () => {
    setPinError(null);
    setIsVerifyingPin(true);
    try {
      const ok = await verifyVaultPin(pinInput);
      if (ok) {
        setIsLocked(false);
        setPinInput('');
      } else {
        setPinError('Incorrect Vault PIN.');
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <GuardIaLogo size="sm" />
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-[#A70F43]" />
                <h2 className="text-base font-extrabold text-[#2F2B2D]">Evidence Vault</h2>
              </div>
              <p className="text-xs text-[#7B7280]">Encrypted cloud audio &amp; video logs</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#A70F43]" />
            <div>
              <div className="text-xs font-bold text-[#2F2B2D] flex items-center gap-1.5">
                Encrypted Cloud Evidence Vault
              </div>
              <p className="text-[10px] text-[#7B7280]">
                Tamper-proof video &amp; audio recorder with live GPS watermark, timestamping, and cloud backup.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Live Capture Panel */}
        <div className="lg:col-span-6 bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-2 text-xs">
            <span className="font-bold text-[#2F2B2D] flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#A70F43]" />
              Live Evidence Capture HUD
            </span>
            <button
              onClick={() => setCameraMode(cameraMode === 'front' ? 'rear' : 'front')}
              className="px-2.5 py-1 rounded-lg bg-[#FFF8F9] border border-[#E9D8DE] text-[#2F2B2D] hover:bg-[#FFF0F3] text-[10px] font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3 text-[#A70F43]" />
              <span>{cameraMode === 'front' ? 'Front Cam' : 'Rear Cam'}</span>
            </button>
          </div>

          {/* Camera Stream Viewport Container */}
          <div className="relative bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl overflow-hidden min-h-[250px] flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover absolute inset-0" />

            {/* Live Watermark Overlay (Timestamp + GPS + Hash) */}
            <div className="absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex justify-between text-[10px] font-mono text-white z-10">
              <div className="space-y-0.5">
                <div className="font-bold">REC_WATERMARK_ENCRYPTED</div>
                <div className="text-white/90 text-[9px]">{new Date().toLocaleString()}</div>
              </div>
              <div className="text-right text-[9px] text-white/90">
                <div>
                  GPS:{' '}
                  {recordingCoords
                    ? `${recordingCoords.lat.toFixed(4)} N, ${recordingCoords.lng.toFixed(4)} E`
                    : isRecording
                    ? 'Acquiring signal…'
                    : 'Awaiting recording'}
                </div>
                <div className="text-white font-bold">SHA-256 Hash Active</div>
              </div>
            </div>

            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-2 bg-[#A70F43] text-white px-3 py-1 rounded-full text-xs font-mono font-bold animate-pulse border border-[#8D0D39]">
                <span className="w-2 h-2 rounded-full bg-white"></span>
                <span>REC 00:{recordSeconds < 10 ? '0' + recordSeconds : recordSeconds}</span>
              </div>
            )}

            {isSaving && (
              <div className="absolute bottom-3 right-3 z-10 flex items-center space-x-2 bg-white text-[#A70F43] px-3 py-1 rounded-full text-xs font-mono font-bold border border-[#E9D8DE]">
                <Upload className="w-3 h-3" />
                <span>Encrypting &amp; uploading…</span>
              </div>
            )}

            {!isRecording && !isSaving && (
              <div className="relative z-10 text-center p-6 space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-white text-[#A70F43] border border-[#E9D8DE] flex items-center justify-center shadow-sm">
                  <Video className="w-6 h-6" />
                </div>
                <p className="text-xs text-[#7B7280]">Camera Preview Ready. Press Record to capture evidence.</p>
              </div>
            )}
          </div>

          {/* Recording Controls Bar */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isSaving}
                className="col-span-2 py-2.5 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] disabled:opacity-60 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all border border-[#8D0D39]"
              >
                <Video className="w-4 h-4" />
                <span>{isSaving ? 'SAVING…' : 'START ENCRYPTED RECORDING'}</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="col-span-2 py-2.5 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all animate-pulse border border-[#8D0D39]"
              >
                <StopCircle className="w-4 h-4" />
                <span>SAVE & UPLOAD TO VAULT</span>
              </button>
            )}
          </div>
        </div>

        {/* Vault Locker Gallery */}
        <div className="lg:col-span-6 bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-2 text-xs">
            <span className="font-bold text-[#2F2B2D] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#A70F43]" />
              Saved Evidence Locker ({evidenceList.length})
            </span>
            {/* Only ever LOCKS directly — re-locking needs no PIN, but
                unlocking must always go through the real PIN form below.
                Previously this toggled straight to unlocked with no check
                at all, which was its own bypass of the PIN entirely. */}
            {!isLocked && (
              <button
                onClick={() => setIsLocked(true)}
                className="text-[10px] font-mono text-[#A70F43] hover:underline font-bold"
              >
                Lock Vault
              </button>
            )}
          </div>

          {/* Locked PIN Challenge — real setup/verify flow, no default or blank bypass */}
          {isLocked ? (
            <div className="bg-[#FFF8F9] p-5 rounded-xl border border-[#E9D8DE] text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#E9D8DE] flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>

              {needsPinSetup ? (
                <>
                  <div>
                    <h4 className="text-xs font-bold text-[#2F2B2D]">Set up your Vault PIN</h4>
                    <p className="text-[10px] text-[#7B7280] mt-0.5">
                      Choose a 4-8 digit PIN to protect your evidence. You'll need it every time you open the vault.
                    </p>
                  </div>
                  <div className="max-w-xs mx-auto space-y-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="New PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      className="w-full bg-white border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-center text-xs font-mono text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="Confirm PIN"
                      value={pinConfirmInput}
                      onChange={(e) => setPinConfirmInput(e.target.value)}
                      className="w-full bg-white border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-center text-xs font-mono text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                    />
                    {pinError && <p className="text-[10px] text-[#A70F43] font-semibold">{pinError}</p>}
                    <button
                      onClick={handleSetupPin}
                      disabled={isVerifyingPin || !pinInput || !pinConfirmInput}
                      className="w-full px-3.5 py-1.5 bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      Set PIN &amp; Unlock
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h4 className="text-xs font-bold text-[#2F2B2D]">Protected Evidence Vault</h4>
                    <p className="text-[10px] text-[#7B7280] mt-0.5">Enter your Vault PIN</p>
                  </div>

                  <div className="max-w-xs mx-auto flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlockVault()}
                      className="w-full bg-white border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-center text-xs font-mono text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                    />
                    <button
                      onClick={handleUnlockVault}
                      disabled={isVerifyingPin || !pinInput}
                      className="px-3.5 py-1.5 bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs rounded-xl transition-colors shrink-0 shadow-sm disabled:opacity-50"
                    >
                      Unlock
                    </button>
                  </div>
                  {pinError && <p className="text-[10px] text-[#A70F43] font-semibold max-w-xs mx-auto">{pinError}</p>}
                </>
              )}
            </div>
          ) : (
            /* Evidence Unlocked List */
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {evidenceList.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] hover:border-[#A70F43] transition-colors space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-[#2F2B2D] flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#A70F43] text-white font-mono font-bold">
                          {item.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[#7B7280] text-[10px] mt-0.5">
                        {item.timestamp} • {item.locationName}
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-mono flex items-center gap-1 px-2 py-0.5 rounded border font-bold ${
                        item.isCloudBackedUp
                          ? 'text-[#5FA777] bg-[#FFF0F3] border-[#E9D8DE]'
                          : 'text-[#A70F43] bg-[#FFF0F3] border-[#E9D8DE]'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {item.isCloudBackedUp ? 'Cloud Sync' : 'Local Only (upload failed)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#7B7280] border-t border-[#E9D8DE] pt-1.5">
                    <span>
                      Duration: <strong className="text-[#2F2B2D]">{item.duration}</strong>
                    </span>
                    <span>
                      Size: <strong className="text-[#2F2B2D]">{item.fileSize}</strong>
                    </span>

                    <button
                      onClick={() => alert(`Exporting encrypted dossier for file ${item.title}...`)}
                      className="text-[#A70F43] hover:text-[#8D0D39] font-bold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};