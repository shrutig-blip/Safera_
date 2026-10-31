import React, { useState, useEffect, useRef } from 'react';
import { shareSosEvidenceSnapshot } from '../lib/sosEvidenceLink';
import { EmergencyContact } from '../types';
import { EvidenceRecorderState } from '../hooks/useEvidenceRecorder';
import { GuardIaLogo } from './GuardIaLogo';
import {
  AlertTriangle,
  Phone,
  Send,
  Mic,
  ShieldAlert,
  CheckCircle2,
  UserPlus,
  Trash2,
  Smartphone,
  Volume2,
  X,
  MessageSquareText,
  MapPin,
  Camera,
} from 'lucide-react';
import { getBestEffortLocation, buildSosMessage, buildSmsLinks, SosCoords } from '../utils/sos';

/** Turns "98765 43210", "09876543210", "91 98765 43210" or "+91 98765 43210" into E.164 (+919876543210). */
function toE164(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  const digits = cleaned.replace(/^0+/, '');
  if (/^\d{10}$/.test(digits)) return `+91${digits}`; // bare Indian mobile number
  return `+${digits}`;
}

interface SosDialogProps {
  isOpen: boolean;
  onClose: () => void;
  autoDispatch: boolean;
  onAutoDispatchHandled: () => void;
  contacts: EmergencyContact[];
  onAddContact: (contact: EmergencyContact) => void;
  onDeleteContact: (id: string) => void;
  isOffline: boolean;
  /** Starts encrypted evidence recording — called the moment SOS dispatch fires. */
  onStartRecording: () => void;
  /** Stops, encrypts, and uploads whatever was captured. */
  onStopRecording: () => void;
  isRecording: boolean;
  recorder?: EvidenceRecorderState;
}

export const SosDialog: React.FC<SosDialogProps> = ({
  isOpen,
  onClose,
  autoDispatch,
  onAutoDispatchHandled,
  contacts,
  onAddContact,
  onDeleteContact,
  isOffline,
  onStartRecording,
  onStopRecording,
  isRecording,
  recorder,
}) => {
  const [dispatchStage, setDispatchStage] = useState<'idle' | 'countdown' | 'dispatched'>('idle');
  const [cancelSeconds, setCancelSeconds] = useState(5);
  const [powerButtonClicks, setPowerButtonClicks] = useState(0);
  const [alertDelivery, setAlertDelivery] = useState<{ status: 'sending' | 'sent' | 'failed'; message: string } | null>(null);
  const alertRequestStarted = useRef(false);
  const autoDispatchStarted = useRef(false);

  // Automatic evidence-link updates (first one 10 s after the alert, then 10 s after each finishes, max 6).
  const EVIDENCE_FIRST_SEC = 10;
  const EVIDENCE_EVERY_SEC = 10;
  const EVIDENCE_MAX_UPDATES = 6;
  const [evidenceStatus, setEvidenceStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const latest = useRef<{ recorder?: EvidenceRecorderState; contacts: typeof contacts; coords: SosCoords | null }>({
    recorder,
    contacts,
    coords: null,
  });

  // Real dispatch data — populated as soon as dispatch starts, so it's
  // ready by the time the cancel countdown finishes.
  const [coords, setCoords] = useState<SosCoords | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [smsLinks, setSmsLinks] = useState<ReturnType<typeof buildSmsLinks>>([]);

  // Contact form state
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRelation, setNewContactRelation] = useState('Family');
  const [newContactTelegram, setNewContactTelegram] = useState('');

  // Power Button 4-Click Simulation Timer
  useEffect(() => {
    if (powerButtonClicks > 0) {
      const timer = setTimeout(() => setPowerButtonClicks(0), 2000);
      return () => clearTimeout(timer);
    }
  }, [powerButtonClicks]);

  const handleSimulatePowerClick = () => {
    const nextCount = powerButtonClicks + 1;
    setPowerButtonClicks(nextCount);
    if (nextCount >= 4) {
      setPowerButtonClicks(0);
      triggerSosDispatch();
    }
  };

  // Countdown timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (dispatchStage === 'countdown' && cancelSeconds > 0) {
      timer = setTimeout(() => setCancelSeconds(cancelSeconds - 1), 1000);
    } else if (dispatchStage === 'countdown' && cancelSeconds === 0) {
      setDispatchStage('dispatched');
    }
    return () => clearTimeout(timer);
  }, [dispatchStage, cancelSeconds]);

  useEffect(() => {
    if (dispatchStage !== 'dispatched' || locationPending || alertRequestStarted.current) return;
    alertRequestStarted.current = true;

    // Each contact can be reached by SMS (valid phone + SMS enabled) and/or Telegram (chat ID).
    const alertContacts = contacts
      .map((contact) => {
        const phone = contact.sendSms && contact.phone?.trim() ? toE164(contact.phone) : undefined;
        return {
          name: contact.name,
          phone: phone && /^\+[1-9]\d{7,14}$/.test(phone) ? phone : undefined,
          telegramChatId: contact.telegramChatId?.trim() || undefined,
        };
      })
      .filter((contact) => contact.phone || contact.telegramChatId);

    if (alertContacts.length === 0) {
      setAlertDelivery({
        status: 'failed',
        message: 'No contact has a valid phone number (+91...) or Telegram chat ID for automatic sending.',
      });
      return;
    }

    setAlertDelivery({ status: 'sending', message: 'Sending emergency alert to your contacts…' });
    void fetch('/api/alert/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'sos',
        name: 'A Safera user',
        lat: coords?.lat,
        lng: coords?.lng,
        liveSessionId,
        liveViewUrl: liveUrl,
        contacts: alertContacts,
      }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Alert delivery failed');

        type Delivery = { ok?: boolean; channel?: string; contact?: string; error?: string };
        const deliveries: Delivery[] = Array.isArray(result.results) ? result.results : [];
        const real = deliveries.filter((d) => d.ok && d.channel !== 'dry-run');
        const reached = new Set(real.map((d) => d.contact)).size;
        const channels = [...new Set(real.map((d) => d.channel))].join(' + ');
        const simulated = deliveries.some((d) => d.ok && d.channel === 'dry-run');

        if (real.length > 0) {
          setAlertDelivery({
            status: 'sent',
            message: `Automatic alert sent to ${reached} of ${alertContacts.length} contact${alertContacts.length === 1 ? '' : 's'} (${channels}).`,
          });
        } else if (simulated) {
          setAlertDelivery({
            status: 'failed',
            message: 'Server has no messaging channel configured (dry-run); no messages were sent.',
          });
        } else {
          const firstError = deliveries.find((d) => !d.ok && d.error)?.error;
          setAlertDelivery({
            status: 'failed',
            message: `Automatic sending failed${firstError ? ` (${firstError})` : ''}. Use the manual SMS option below.`,
          });
        }
      })
      .catch((error: unknown) => {
        console.error('Automatic SOS alert failed:', error);
        setAlertDelivery({ status: 'failed', message: 'Could not send automatically. Use the manual SMS option below.' });
      });
  }, [dispatchStage, locationPending, contacts, coords, liveSessionId, liveUrl]);

  // Keep the newest values available to the long-running evidence timer below.
  useEffect(() => {
    latest.current = { recorder, contacts, coords };
  });

  // After the automatic alert went out, keep sharing what has been recorded so far:
  // upload a playable copy to Cloudinary, let the server verify the link, then text it.
  useEffect(() => {
    if (dispatchStage !== 'dispatched' || alertDelivery?.status !== 'sent') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let part = 0;

    const run = async () => {
      if (cancelled) return;
      const { recorder: rec, contacts: cs, coords: c } = latest.current;
      const blob = rec?.getLiveSnapshot?.();
      if (!rec || !blob) return; // recording was stopped or never started: nothing more to share

      const evidenceContacts = cs
        .map((contact) => {
          const phone = contact.sendSms && contact.phone?.trim() ? toE164(contact.phone) : undefined;
          return {
            name: contact.name,
            phone: phone && /^\+[1-9]\d{7,14}$/.test(phone) ? phone : undefined,
            telegramChatId: contact.telegramChatId?.trim() || undefined,
          };
        })
        .filter((contact) => contact.phone || contact.telegramChatId);
      if (evidenceContacts.length === 0) return;

      part += 1;
      setEvidenceStatus({ ok: true, message: `Uploading evidence recording (update ${part})…` });
      try {
        const out = await shareSosEvidenceSnapshot({
          blob,
          kind: rec.recordType === 'audio' ? 'audio' : 'video',
          part,
          coords: c ? { lat: c.lat, lng: c.lng } : null,
          contacts: evidenceContacts,
        });
        if (cancelled) return;
        setEvidenceStatus(
          out.accessible && out.delivered > 0
            ? { ok: true, message: `Evidence link verified and sent to your contacts (update ${part}).` }
            : { ok: false, message: `Evidence link could not be verified${out.error ? ` (${out.error})` : ''}; it was not sent.` }
        );
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('Automatic evidence share failed:', err);
        setEvidenceStatus({ ok: false, message: `Evidence link not sent: ${err instanceof Error ? err.message : 'unknown error'}` });
      }
      if (!cancelled && part < EVIDENCE_MAX_UPDATES) timer = setTimeout(run, EVIDENCE_EVERY_SEC * 1000);
    };

    timer = setTimeout(run, EVIDENCE_FIRST_SEC * 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dispatchStage, alertDelivery?.status]);

  const triggerSosDispatch = (immediate = false) => {
    alertRequestStarted.current = false;
    setAlertDelivery(null);
    setEvidenceStatus(null);
    setCancelSeconds(5);
    setDispatchStage(immediate ? 'dispatched' : 'countdown');
    setCoords(null);
    setLiveUrl(null);
    setLiveSessionId(null);
    setSmsLinks([]);

    // Start encrypted evidence recording immediately — don't wait for the
    // 5s cancel countdown to finish. If this is a real emergency, every
    // second of footage from the moment SOS is pressed matters; if it's a
    // false alarm, handleCancelSos below stops and still saves whatever
    // was captured.
    onStartRecording();

    // Runs in parallel with the 5s cancel countdown, so real data is ready
    // the moment dispatch actually fires — not fetched after the fact.
    setLocationPending(true);
    getBestEffortLocation().then(async (bestCoords) => {
      setCoords(bestCoords);

      let url: string | undefined;

      // Only attempt live tracking when connected. The automatic alert is
      // sent after this completes so it can include the location and link.
      if (!isOffline && bestCoords) {
        try {
          const res = await fetch('/api/live-location/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: bestCoords.lat,
              lng: bestCoords.lng,
              accuracy: bestCoords.accuracy,
              label: 'SOS Alert',
            }),
          });
          if (res.ok) {
            const session = await res.json();
            url = `${window.location.origin}/live/${session.id}`;
            setLiveUrl(url);
            setLiveSessionId(session.id);
          }
        } catch {
          // Network hiccup mid-dispatch — fall through to SMS-only, same as the offline path.
        }
      }

      setSmsLinks(buildSmsLinks(contacts, buildSosMessage(bestCoords, url)));
    }).catch((error: unknown) => {
      console.error('Could not prepare SOS location:', error);
      setCoords(null);
      setSmsLinks(buildSmsLinks(contacts, buildSosMessage(null)));
    }).finally(() => setLocationPending(false));
  };

  useEffect(() => {
    if (!autoDispatch) {
      autoDispatchStarted.current = false;
      return;
    }
    if (!isOpen || autoDispatchStarted.current) return;
    autoDispatchStarted.current = true;
    onAutoDispatchHandled();
    triggerSosDispatch(true);
  }, [isOpen, autoDispatch, onAutoDispatchHandled]);

  const handleCancelSos = () => {
    setDispatchStage('idle');
    setCancelSeconds(5);
    if (liveSessionId) {
      fetch(`/api/live-location/${liveSessionId}/stop`, { method: 'POST' }).catch(() => {});
    }
    // Nothing was actually dispatched to contacts yet during the countdown,
    // so treat cancel the same way as ending a false-alarm recording: stop,
    // encrypt, and save whatever few seconds were captured rather than
    // discarding it outright.
    onStopRecording();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E9D8DE] rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl relative space-y-5 my-auto text-[#2F2B2D]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-3">
          <div className="flex items-center space-x-3">
            <GuardIaLogo size="md" />
            <div>
              <h2 className="text-lg font-extrabold text-[#2F2B2D]">SOS Emergency Dispatch Hub</h2>
              <p className="text-xs text-[#7B7280]">
                Live location broadcast, emergency contacts SMS & police hotline dispatch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] flex items-center justify-center text-[#7B7280] hover:text-[#2F2B2D] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Dual Evidence Camera Viewfinder (Instant upon SOS trigger) */}
        {isRecording && (
          <div className="bg-white border-2 border-[#A70F43]/30 rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-md animate-fadeIn">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#A70F43] animate-pulse" />
                <span className="text-xs font-black text-[#A70F43]">
                  REC {recorder ? `00:${recorder.recordSeconds < 10 ? '0' + recorder.recordSeconds : recorder.recordSeconds}` : ''}
                </span>

                {/* Mode Indicator: Dual Camera Active vs Rear Camera Only */}
                {recorder?.cameraModeStatus === 'dual' ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Dual Camera Active
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-50 text-amber-900 font-extrabold px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                    Rear Camera Only
                  </span>
                )}
              </div>

              <button
                onClick={onStopRecording}
                className="text-[10px] font-black text-[#A70F43] hover:underline uppercase tracking-wider"
              >
                Stop & Save to Vault
              </button>
            </div>

            {/* Small clear fallback notification when dual camera is unsupported */}
            {recorder?.fallbackNotice && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-amber-900 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{recorder.fallbackNotice}</span>
              </div>
            )}

            {/* Live Camera Viewport */}
            <div className="relative w-full aspect-video max-h-60 bg-black rounded-xl overflow-hidden flex items-center justify-center border border-[#E9D8DE] shadow-inner">
              <video
                ref={(el) => {
                  if (el && recorder?.activePreviewStream && el.srcObject !== recorder.activePreviewStream) {
                    el.srcObject = recorder.activePreviewStream;
                    void el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
              <div className="absolute top-2 left-2 px-2.5 py-0.5 bg-black/75 backdrop-blur-sm rounded text-[9px] font-mono text-white flex items-center gap-1.5 z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                <span>LIVE EVIDENCE • {recorder?.cameraModeLabel?.toUpperCase() || 'RECORDING'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Dispatch Screen Stages */}
        {dispatchStage === 'countdown' && (
          <div className="bg-[#FFF0F3] border-2 border-[#A70F43] rounded-2xl p-5 text-center space-y-3 animate-pulse">
            <h3 className="text-sm font-bold text-[#A70F43]">DISPATCHING EMERGENCY SOS ALERT IN:</h3>
            <div className="text-5xl font-mono font-black text-[#2F2B2D]">{cancelSeconds}</div>
            <p className="text-xs text-[#7B7280]">
              {locationPending
                ? 'Getting your location…'
                : coords
                ? `Preparing alert at ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} for ${contacts.length} emergency contact${contacts.length === 1 ? '' : 's'}`
                : `Location unavailable — preparing SMS alert for ${contacts.length} emergency contact${contacts.length === 1 ? '' : 's'} without it`}
              {isOffline && ' (offline — SMS fallback only)'}
            </p>
            <button
              onClick={handleCancelSos}
              className="px-5 py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-extrabold text-xs shadow-sm"
            >
              CANCEL EMERGENCY ALARM
            </button>
          </div>
        )}

        {dispatchStage === 'dispatched' && (
          <div className="bg-[#FFF8F9] border-2 border-[#A70F43] rounded-2xl p-5 text-left space-y-3">
            <div className="flex items-center gap-2 justify-center">
              <div className="w-10 h-10 rounded-full bg-[#A70F43] text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-extrabold text-[#2F2B2D]">SOS Alert Ready</h3>
            </div>

            {isRecording && (
              <div className="bg-white border border-[#E9D8DE] rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#A70F43] animate-pulse" />
                    <span className="text-xs font-bold text-[#A70F43]">
                      Evidence Recording ({recorder ? `00:${recorder.recordSeconds < 10 ? '0' + recorder.recordSeconds : recorder.recordSeconds}` : 'Active'})
                    </span>
                    {recorder?.isDualCamera ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1">
                        <Camera className="w-3 h-3 text-emerald-700" />
                        DUAL CAM (REAR + FRONT PiP)
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                        <Camera className="w-3 h-3 text-amber-700" />
                        SINGLE CAM
                      </span>
                    )}
                  </div>
                  <button
                    onClick={onStopRecording}
                    className="text-[10px] font-bold text-[#A70F43] hover:underline"
                  >
                    Stop & Save to Vault
                  </button>
                </div>

                {/* Live Video Preview in SOS Dialog */}
                <div className="relative w-full h-44 bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center border border-[#E9D8DE]">
                  <video
                    ref={(el) => {
                      if (el && recorder?.activePreviewStream && el.srcObject !== recorder.activePreviewStream) {
                        el.srcObject = recorder.activePreviewStream;
                        void el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[9px] font-mono text-white flex items-center gap-1.5 z-10">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                    <span>REC • {recorder?.isDualCamera ? 'DUAL ANGLE COMPOSITED' : 'ACTIVE'}</span>
                  </div>
                  {recorder?.isDualCamera && (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[9px] font-mono text-emerald-300 z-10 border border-emerald-500/30">
                      FRONT PiP + REAR FULL
                    </div>
                  )}
                </div>
              </div>
            )}

            {alertDelivery && (
              <p
                role="status"
                className={`text-xs text-center font-semibold ${
                  alertDelivery.status === 'failed' ? 'text-[#A70F43]' : 'text-[#7B7280]'
                }`}
              >
                {alertDelivery.message}
              </p>
            )}

            {evidenceStatus && (
              <p
                role="status"
                className={`text-xs text-center font-semibold ${evidenceStatus.ok ? 'text-[#7B7280]' : 'text-[#A70F43]'}`}
              >
                {evidenceStatus.message}
              </p>
            )}

            {locationPending ? (
              <p className="text-xs text-[#7B7280] text-center">Preparing your location for the alert…</p>
            ) : coords ? (
              <div className="flex items-center gap-1.5 text-xs text-[#7B7280] justify-center">
                <MapPin className="w-3.5 h-3.5 text-[#A70F43]" />
                <span>
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  {Date.now() - coords.timestamp > 60_000 ? ' (last known)' : ''}
                </span>
              </div>
            ) : (
              <p className="text-xs text-[#7B7280] text-center">Location unavailable — alert sent without it.</p>
            )}

            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="block bg-white p-2.5 rounded-xl text-xs font-mono text-[#A70F43] border border-[#E9D8DE] break-all hover:bg-[#FFF0F3] transition-colors"
              >
                {liveUrl}
              </a>
            )}
            {!liveUrl && isOffline && (
              <p className="text-[11px] text-[#7B7280] text-center">
                Offline — no live tracking link. Your contacts still get your location via SMS below.
              </p>
            )}

            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-bold text-[#7B7280] uppercase tracking-wide">
                Manual SMS backup ({smsLinks.length} of {contacts.length} contacts have SMS enabled)
              </p>
              {smsLinks.length === 0 && (
                <p className="text-xs text-[#7B7280]">
                  No contacts have SMS alerts enabled. Add one below or enable "Send SMS" for an existing contact.
                </p>
              )}
              {smsLinks.map(({ contact, href }) => (
                <a
                  key={contact.id}
                  href={href}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#E9D8DE] hover:border-[#A70F43] transition-colors text-xs"
                >
                  <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                    <MessageSquareText className="w-3.5 h-3.5 text-[#A70F43]" />
                    {contact.name}
                  </span>
                  <span className="font-mono text-[#7B7280]">{contact.phone}</span>
                </a>
              ))}
            </div>

            <a
              href="tel:112"
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white border border-[#E9D8DE] hover:border-[#A70F43] text-xs font-bold text-[#2F2B2D] transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-[#A70F43]" />
              Call Police (112)
            </a>

            <button
              onClick={() => setDispatchStage('idle')}
              className="w-full px-4 py-1.5 rounded-xl bg-[#FFF8F9] text-[#2F2B2D] font-bold text-xs border border-[#E9D8DE]"
            >
              Reset SOS Status
            </button>
          </div>
        )}

        {/* Primary 1-Press SOS Action */}
        <div className="text-center py-1 space-y-2">
          <button
            onClick={() => triggerSosDispatch()}
            className="w-full py-4 rounded-2xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-black text-lg shadow-md active:scale-95 transition-all flex items-center justify-center gap-2.5 border border-[#8D0D39]"
          >
            <AlertTriangle className="w-7 h-7 fill-white text-[#A70F43] animate-pulse" />
            <span>PRESS TO DISPATCH INSTANT SOS</span>
          </button>
          <span className="text-[10px] text-[#7B7280] block">
            Sends location URL + SMS alert to pre-saved contacts instantly
          </span>
        </div>

        {/* Advanced Multi-Triggers Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* 4x Power Button Simulator */}
          <button
            onClick={handleSimulatePowerClick}
            className="p-3 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#A70F43]" />
                4x Power Button
              </span>
              <span className="font-mono text-[#A70F43] font-bold">{powerButtonClicks}/4</span>
            </div>
            <p className="text-[10px] text-[#7B7280]">Press 4 times in quick succession for silent SOS.</p>
          </button>

          {/* Voice Command Listener */}
          <button
            onClick={() => triggerSosDispatch()}
            className="p-3 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-[#A70F43]" />
                Voice Command
              </span>
              <span className="text-[9px] text-white uppercase font-bold bg-[#A70F43] px-1.5 rounded">"Help"</span>
            </div>
            <p className="text-[10px] text-[#7B7280]">Triggers when voice keyword "Help Safera" is spoken.</p>
          </button>

          {/* Gesture Trigger Simulator */}
          <button
            onClick={() => triggerSosDispatch()}
            className="p-3 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#A70F43]" />
                Shake Gesture
              </span>
              <span className="text-[9px] text-[#7B7280] font-mono">Simulate</span>
            </div>
            <p className="text-[10px] text-[#7B7280]">Double sharp shake or 3 screen taps triggers SOS.</p>
          </button>
        </div>

        {/* Emergency Contacts Manager Section */}
        <div className="border-t border-[#E9D8DE] pt-4 space-y-3">
          <h3 className="text-xs font-bold text-[#2F2B2D] flex items-center justify-between">
            <span>Pre-Saved Emergency Contacts ({contacts.length})</span>
            <span className="text-[10px] text-[#7B7280] font-normal">Auto SMS & Live Link Enabled</span>
          </h3>

          <div className="space-y-1.5">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] text-xs"
              >
                <div>
                  <div className="font-bold text-[#2F2B2D] flex items-center gap-2">
                    <span>{contact.name}</span>
                    {contact.isPrimary && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#A70F43] text-white font-bold">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <div className="text-[#7B7280] font-mono text-[10px] mt-0.5">{contact.phone} • {contact.relation}</div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[9px] text-[#A70F43] bg-[#FFF0F3] px-2 py-0.5 rounded border border-[#E9D8DE] font-semibold">
                    {contact.telegramChatId ? 'SMS + Telegram' : 'SMS Ready'}
                  </span>
                  {!contact.isPrimary && (
                    <button
                      onClick={() => onDeleteContact(contact.id)}
                      className="p-1 text-[#7B7280] hover:text-[#A70F43] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add New Contact Form */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <input
              type="text"
              placeholder="Contact Name"
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              className="bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
            />
            <input
              type="text"
              placeholder="Phone (+1 555...)"
              value={newContactPhone}
              onChange={(e) => setNewContactPhone(e.target.value)}
              className="bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
            />
            <input
              type="text"
              placeholder="Telegram chat ID (optional)"
              value={newContactTelegram}
              onChange={(e) => setNewContactTelegram(e.target.value.trim())}
              className="bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
            />
            <button
              onClick={() => {
                if (newContactName && newContactPhone) {
                  onAddContact({
                    id: `c-${Date.now()}`,
                    name: newContactName,
                    relation: newContactRelation,
                    phone: newContactPhone,
                    isPrimary: false,
                    sendSms: true,
                    telegramChatId: newContactTelegram || undefined,
                  });
                  setNewContactName('');
                  setNewContactPhone('');
                  setNewContactTelegram('');
                }
              }}
              className="bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold py-1.5 px-3 rounded-xl flex items-center justify-center gap-1 transition-colors border border-[#8D0D39]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Contact</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};