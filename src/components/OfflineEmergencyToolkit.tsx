import React, { useState, useRef, useEffect } from "react";
import { EmergencyContact, FakeCallConfig } from "../types";
import { GuardIaLogo } from "./GuardIaLogo";
import {
  Phone,
  Volume2,
  Flashlight,
  WifiOff,
  MapPin,
  Send,
  AlertTriangle,
  ShieldCheck,
  Clock,
  PhoneIncoming,
  PhoneOff,
  Zap,
  Shield,
  HelpCircle,
  MessageSquareText,
} from "lucide-react";
import { EMERGENCY_HOTLINES } from "../data/mockData";
import {
  getBestEffortLocation,
  getCachedLocation,
  buildSosMessage,
  buildSmsLinks,
  SosCoords,
} from "../utils/sos";

interface OfflineEmergencyToolkitProps {
  isOffline: boolean;
  isRealOffline: boolean;
  setIsOffline: (val: boolean) => void;
  onTriggerSos: () => void;
  contacts: EmergencyContact[];
}

// Languages offered for the fake-call voice script. `code` must match a
// BCP-47 lang tag (e.g. "hi-IN") so we can match it against
// speechSynthesis voices. Actual availability depends on the user's
// browser/OS — we fall back gracefully if a given language has no voice.
const FAKE_CALL_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
];

export const OfflineEmergencyToolkit: React.FC<
  OfflineEmergencyToolkitProps
> = ({ isOffline, isRealOffline, setIsOffline, onTriggerSos, contacts }) => {
  // Real location for the SMS fallback panel — start from whatever's cached
  // so the panel is useful instantly, then refine with a live fix.
  const [coords, setCoords] = useState<SosCoords | null>(() => getCachedLocation());
  const [locatingNow, setLocatingNow] = useState(false);

  const refreshLocation = () => {
    setLocatingNow(true);
    getBestEffortLocation().then((c) => {
      setCoords(c);
      setLocatingNow(false);
    });
  };

  useEffect(() => {
    refreshLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sosMessage = buildSosMessage(coords);
  const smsLinks = buildSmsLinks(contacts, sosMessage);

  // Fake Call State
  const [fakeCallActive, setFakeCallActive] = useState(false);
  const [fakeCallTimerSec, setFakeCallTimerSec] = useState<number | null>(null);
  const [fakeCallConfig, setFakeCallConfig] = useState<FakeCallConfig>({
    callerName: "Mom (Urgent Call)",
    callerNumber: "+1 (555) 019-2834",
    delaySeconds: 5,
    voiceScript: "Hey, where are you? I need you home right now, please hurry!",
    langCode: "en-IN",
  });

  // Real audio for the fake call — ringtone synthesized via Web Audio API
  // (no external mp3 needed, works fully offline) and voice spoken via the
  // browser's built-in SpeechSynthesis API.
  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Cache of voices the browser exposes for speechSynthesis. Populated on
  // mount (voices load asynchronously in most browsers, hence the
  // `voiceschanged` listener rather than a single getVoices() call).
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices(); // some browsers (e.g. Firefox) have voices ready immediately
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Siren Synth State
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const [oscillator, setOscillator] = useState<OscillatorNode | null>(null);

  // Strobe Flasher State
  const [isStrobeActive, setIsStrobeActive] = useState(false);

  // Trigger Fake Call Delay
  const handleScheduleFakeCall = () => {
    setFakeCallTimerSec(fakeCallConfig.delaySeconds);
    const interval = setInterval(() => {
      setFakeCallTimerSec((prev) => {
        if (prev === 1) {
          clearInterval(interval);
          setFakeCallActive(true);
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  // Plays a real, audible phone-ring pattern using two oscillators (a
  // classic dual-tone ring, like a real phone) that pulse on/off in a
  // ring-ring...pause pattern. Fully synthesized — no audio file needed,
  // works offline.
  const startRingtone = () => {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    ringtoneCtxRef.current = ctx;

    const playRing = () => {
      const now = ctx.currentTime;
      [440, 480].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.15, now); // moderate volume
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1); // one ring burst = 1 second
      });
    };

    playRing(); // first ring immediately
    // classic phone cadence: ~1s ring, ~2s pause, repeat
    ringtoneIntervalRef.current = setInterval(playRing, 3000);
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (ringtoneCtxRef.current) {
      ringtoneCtxRef.current.close();
      ringtoneCtxRef.current = null;
    }
  };

  // Picks the best available voice for a given lang code: prefers a
  // network/cloud voice (localService === false — these are almost always
  // the more natural-sounding ones, e.g. "Google US English") that exactly
  // matches the lang code, then falls back to any voice sharing just the
  // base language (e.g. "hi" for "hi-IN"), then to the browser default.
  const pickVoice = (langCode: string): SpeechSynthesisVoice | undefined => {
    const voices = voicesRef.current;
    if (!voices.length) return undefined;
    const base = langCode.split("-")[0];

    return (
      voices.find((v) => v.lang === langCode && v.localService === false) ||
      voices.find((v) => v.lang === langCode) ||
      voices.find((v) => v.lang.startsWith(base) && v.localService === false) ||
      voices.find((v) => v.lang.startsWith(base))
    );
  };

  // Speaks the voice script out loud using the browser's built-in TTS —
  // works fully offline on most platforms (Android/desktop Chrome/Edge
  // ship offline voices; iOS Safari may require network for some voices).
  // Rate/pitch are tuned slightly down from the 1.0 default, which reads
  // as calmer and less robotic for a phone-call context.
  const speakScript = (text: string, langCode: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); // clear any queued speech first

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;

    const voice = pickVoice(langCode);
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Start the ringtone the moment the fake call screen appears, and make
  // sure everything is cleaned up if the component unmounts mid-call.
  useEffect(() => {
    if (fakeCallActive) {
      startRingtone();
    } else {
      stopRingtone();
      stopSpeaking();
    }
    return () => {
      stopRingtone();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fakeCallActive]);

  // Loud Emergency Siren Synthesizer
  const toggleSiren = () => {
    if (isSirenActive) {
      if (oscillator) oscillator.stop();
      if (audioCtx) audioCtx.close();
      setIsSirenActive(false);
      setOscillator(null);
      setAudioCtx(null);
    } else {
      const ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(800, ctx.currentTime);

      // Frequency modulation for loud siren oscillation
      let up = true;
      setInterval(() => {
        if (osc.frequency) {
          osc.frequency.setValueAtTime(up ? 1200 : 600, ctx.currentTime + 0.3);
          up = !up;
        }
      }, 400);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      setAudioCtx(ctx);
      setOscillator(osc);
      setIsSirenActive(true);
    }
  };

  // Flashlight SOS Screen Strobe
  const toggleStrobe = () => {
    setIsStrobeActive(!isStrobeActive);
  };

  return (
    <div className="space-y-5">
      {/* Top Offline Mode Switch & Toolkit Header */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <GuardIaLogo size="sm" />
            <div>
              <div className="flex items-center space-x-2">
                <WifiOff className="w-4 h-4 text-[#A70F43]" />
                <h2 className="text-base font-bold text-[#2F2B2D]">
                  All-In-One Offline & Safety Toolkit
                </h2>
              </div>
              <p className="text-xs text-[#7B7280] mt-0.5">
                Works without internet: SMS alerts, fake incoming call
                generator, siren, and cached maps.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOffline(!isOffline)}
            disabled={isRealOffline}
            title={
              isRealOffline
                ? "Your device is actually offline right now — can't be toggled off"
                : "Force offline mode for testing"
            }
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center space-x-2 shrink-0 disabled:cursor-not-allowed disabled:opacity-80 ${
              isOffline
                ? "bg-[#A70F43] text-white border-[#8D0D39] shadow-sm"
                : "bg-[#FFF8F9] text-[#7B7280] border-[#E9D8DE]"
            }`}
          >
            <WifiOff className="w-4 h-4" />
            <span>
              {isRealOffline
                ? "Offline (detected)"
                : isOffline
                ? "Offline Maps: LOADED"
                : "Offline Maps: STANDBY"}
            </span>
          </button>
        </div>
      </div>

      {/* Screen Strobe Flashlight Overlay */}
      {isStrobeActive && (
        <div
          onClick={toggleStrobe}
          className="fixed inset-0 z-50 bg-white animate-ping flex items-center justify-center cursor-pointer"
        >
          <span className="bg-[#2F2B2D] text-white font-extrabold px-6 py-3 rounded-2xl text-base border border-[#A70F43]">
            SOS STROBE FLASHLIGHT ACTIVE (Tap to stop)
          </span>
        </div>
      )}

      {/* Fake Call Incoming Phone Call Modal Simulation */}
      {fakeCallActive && (
        <div className="fixed inset-0 z-50 bg-[#2F2B2D] text-white flex flex-col justify-between p-6 animate-fade-in">
          <div className="text-center mt-10 space-y-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#E9D8DE]">
              Incoming Phone Call
            </span>
            <h1 className="text-2xl font-black">{fakeCallConfig.callerName}</h1>
            <p className="text-xs font-mono text-[#E9D8DE]">
              {fakeCallConfig.callerNumber}
            </p>
          </div>

          {/* Caller Photo Avatar Circle */}
          <div className="w-28 h-28 mx-auto rounded-full bg-[#A70F43] border-4 border-white flex items-center justify-center text-3xl font-extrabold animate-pulse shadow-2xl text-white">
            {fakeCallConfig.callerName[0]}
          </div>

          <div className="bg-white/10 p-3.5 rounded-2xl border border-white/20 text-center max-w-md mx-auto space-y-1">
            <span className="text-[10px] text-[#F2C94C] font-mono font-bold uppercase">
              Simulated Voice Script
            </span>
            <p className="text-xs text-white italic">
              "{fakeCallConfig.voiceScript}"
            </p>
          </div>

          {/* Accept / Decline Buttons */}
          <div className="flex justify-around items-center mb-10 max-w-xs mx-auto w-full">
            <button
              onClick={() => {
                stopRingtone();
                stopSpeaking();
                setFakeCallActive(false);
              }}
              className="w-14 h-14 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-lg animate-bounce"
            >
              <PhoneOff className="w-7 h-7" />
            </button>

            <button
              onClick={() => {
                stopRingtone(); // stop ringing the moment the call is "answered"
                speakScript(fakeCallConfig.voiceScript, fakeCallConfig.langCode);
              }}
              className="w-14 h-14 rounded-full bg-[#5FA777] flex items-center justify-center text-white shadow-lg animate-pulse"
            >
              <PhoneIncoming className="w-7 h-7" />
            </button>
          </div>

          {isSpeaking && (
            <div className="text-center -mt-6 mb-4">
              <span className="text-[10px] text-[#F2C94C] font-mono font-bold uppercase animate-pulse">
                🔊 Speaking...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tools Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Fake Call & Loud Siren / Strobe */}
        <div className="lg:col-span-6 bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="border-b border-[#E9D8DE] pb-2">
            <h3 className="text-xs font-bold text-[#2F2B2D] flex items-center gap-2">
              <PhoneIncoming className="w-4 h-4 text-[#A70F43]" />
              Fake Incoming Call Generator
            </h3>
            <p className="text-[10px] text-[#7B7280] mt-0.5">
              Triggers realistic incoming phone call screen & voice script to
              safely exit uncomfortable situations.
            </p>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[#7B7280] mb-1 font-semibold">
                Caller Identity
              </label>
              <input
                type="text"
                value={fakeCallConfig.callerName}
                onChange={(e) =>
                  setFakeCallConfig({
                    ...fakeCallConfig,
                    callerName: e.target.value,
                  })
                }
                className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#7B7280] mb-1 font-semibold">
                  Timer Delay
                </label>
                <select
                  value={fakeCallConfig.delaySeconds}
                  onChange={(e: any) =>
                    setFakeCallConfig({
                      ...fakeCallConfig,
                      delaySeconds: parseInt(e.target.value),
                    })
                  }
                  className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                >
                  <option value="3">Instant (3s)</option>
                  <option value="10">10 Seconds</option>
                  <option value="30">30 Seconds</option>
                  <option value="60">1 Minute</option>
                </select>
              </div>

              <div>
                <label className="block text-[#7B7280] mb-1 font-semibold">
                  Voice Language
                </label>
                <select
                  value={fakeCallConfig.langCode}
                  onChange={(e: any) =>
                    setFakeCallConfig({
                      ...fakeCallConfig,
                      langCode: e.target.value,
                    })
                  }
                  className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
                >
                  {FAKE_CALL_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[#7B7280] mb-1 font-semibold">
                Voice Script
              </label>
              <input
                type="text"
                value={fakeCallConfig.voiceScript}
                onChange={(e) =>
                  setFakeCallConfig({
                    ...fakeCallConfig,
                    voiceScript: e.target.value,
                  })
                }
                className="w-full bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-1.5 text-[#2F2B2D] focus:outline-none focus:border-[#A70F43]"
              />
            </div>

            <button
              onClick={handleScheduleFakeCall}
              disabled={fakeCallTimerSec !== null}
              className="w-full py-2.5 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 border border-[#8D0D39]"
            >
              {fakeCallTimerSec !== null
                ? `Triggering Fake Call in 00:0${fakeCallTimerSec}...`
                : "Schedule Fake Incoming Call"}
            </button>
          </div>

          {/* Siren & Flashlight Emergency Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#E9D8DE]">
            <button
              onClick={toggleSiren}
              className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                isSirenActive
                  ? "bg-[#A70F43] text-white animate-pulse border border-[#8D0D39]"
                  : "bg-[#FFF8F9] hover:bg-[#FFF0F3] text-[#2F2B2D] border border-[#E9D8DE]"
              }`}
            >
              <Volume2 className="w-4 h-4 text-[#A70F43]" />
              <span>{isSirenActive ? "STOP SIREN" : "LOUD SIREN"}</span>
            </button>

            <button
              onClick={toggleStrobe}
              className="py-2.5 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] text-[#2F2B2D] border border-[#E9D8DE] font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <Flashlight className="w-4 h-4 text-[#A70F43]" />
              <span>STROBE FLASHLIGHT</span>
            </button>
          </div>
        </div>

        {/* Local Emergency Hotlines & Nearby Safe Places */}
        <div className="lg:col-span-6 bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="border-b border-[#E9D8DE] pb-2">
            <h3 className="text-xs font-bold text-[#2F2B2D] flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#A70F43]" />
              1-Tap Emergency Hotlines Directory
            </h3>
            <p className="text-[10px] text-[#7B7280] mt-0.5">
              Direct dial lines for police, women helpline, and medical dispatch
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {EMERGENCY_HOTLINES.map((h, i) => (
              <a
                key={i}
                href={`tel:${h.number}`}
                className="p-2.5 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] hover:border-[#A70F43] transition-colors block text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#2F2B2D]">{h.name}</span>
                  <span className="font-mono font-bold text-white bg-[#A70F43] px-2 py-0.5 rounded text-[10px]">
                    {h.number}
                  </span>
                </div>
                <p className="text-[10px] text-[#7B7280] mt-0.5 line-clamp-1">
                  {h.desc}
                </p>
              </a>
            ))}
          </div>

          {/* SMS Alert Fallback Generator — real location, real contacts */}
          <div className="p-3 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-[#A70F43]" />
                Offline SMS Emergency Alert
              </span>
              <button
                onClick={refreshLocation}
                disabled={locatingNow}
                className="text-[10px] font-bold text-[#A70F43] flex items-center gap-1 disabled:opacity-50"
              >
                <MapPin className="w-3 h-3" />
                {locatingNow ? "Locating…" : "Refresh location"}
              </button>
            </div>

            <p className="text-[#2F2B2D] font-mono text-[10px] bg-white p-2 rounded-lg border border-[#E9D8DE] break-words">
              {sosMessage}
            </p>

            {smsLinks.length === 0 ? (
              <p className="text-[10px] text-[#7B7280]">
                No contacts have SMS alerts enabled yet — add or enable one
                from the SOS dialog's contacts list.
              </p>
            ) : (
              <div className="space-y-1.5">
                {smsLinks.map(({ contact, href }) => (
                  <a
                    key={contact.id}
                    href={href}
                    className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-[#A70F43] text-white font-bold text-xs border border-[#8D0D39] hover:bg-[#8D0D39] transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <MessageSquareText className="w-3.5 h-3.5" />
                      Text {contact.name}
                    </span>
                    <span className="font-mono text-[10px] opacity-80">
                      {contact.phone}
                    </span>
                  </a>
                ))}
              </div>
            )}
            <p className="text-[9px] text-[#7B7280]">
              Opens your phone's own Messages app over cellular signal — works
              even with no data connection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
