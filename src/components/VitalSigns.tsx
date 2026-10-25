import React, { useState, useEffect } from 'react';
import { VitalSignData } from '../types';
import { GuardIaLogo } from './GuardIaLogo';
import { Watch, Heart, Activity, AlertTriangle, ShieldCheck, Zap, Sliders, RefreshCw, Bluetooth } from 'lucide-react';

interface VitalSignsProps {
  vitals: VitalSignData;
  onUpdateVitals: (vitals: VitalSignData) => void;
  onTriggerSos: () => void;
}

export const VitalSigns: React.FC<VitalSignsProps> = ({
  vitals,
  onUpdateVitals,
  onTriggerSos,
}) => {
  const [spikeThresholdBpm, setSpikeThresholdBpm] = useState(135);
  const [autoSosOnSpike, setAutoSosOnSpike] = useState(true);
  const [isSimulatingSpike, setIsSimulatingSpike] = useState(false);

  // Live heart rate fluctuation simulation
  useEffect(() => {
    if (!vitals.connected) return;

    const interval = setInterval(() => {
      if (!isSimulatingSpike) {
        const delta = Math.floor(Math.random() * 5) - 2; // -2 to +2
        const nextBpm = Math.max(60, Math.min(120, vitals.heartRate + delta));
        onUpdateVitals({
          ...vitals,
          heartRate: nextBpm,
          isSpike: nextBpm > spikeThresholdBpm,
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [vitals, isSimulatingSpike, spikeThresholdBpm, onUpdateVitals]);

  const handleSimulateSpike = () => {
    setIsSimulatingSpike(true);
    const spikeBpm = 148;
    onUpdateVitals({
      ...vitals,
      heartRate: spikeBpm,
      stressLevel: 88,
      isSpike: true,
    });

    if (autoSosOnSpike) {
      setTimeout(() => {
        setIsSimulatingSpike(false);
        onTriggerSos();
      }, 1500);
    } else {
      setTimeout(() => setIsSimulatingSpike(false), 5000);
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
                <Watch className="w-4 h-4 text-[#A70F43]" />
                <h2 className="text-base font-bold text-[#2F2B2D]">Smartwatch Vital Signs & Stress Monitor</h2>
              </div>
              <p className="text-xs text-[#7B7280] mt-0.5">
                Monitors live heart rate, HRV, and stress levels from paired wearables to detect distress spikes.
              </p>
            </div>
          </div>

          {/* Device Sync Toggle */}
          <button
            onClick={() => onUpdateVitals({ ...vitals, connected: !vitals.connected })}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-2 shadow-sm ${
              vitals.connected
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FFF8F9] text-[#7B7280] border-[#E9D8DE]'
            }`}
          >
            <Bluetooth className="w-4 h-4 text-white" />
            <span>{vitals.connected ? `Synced: ${vitals.wearableName}` : 'Connect Wearable'}</span>
          </button>
        </div>
      </div>

      {/* Vitals Telemetry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Heart Rate BPM Display Card */}
        <div className="bg-white border border-[#E9D8DE] rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-2">
            <span className="text-xs font-bold text-[#7B7280] flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-[#A70F43] fill-[#A70F43] animate-pulse" />
              Heart Rate
            </span>
            <span className="text-[9px] font-mono font-bold bg-[#A70F43] text-white px-2 py-0.5 rounded">
              LIVE BPM
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-mono font-black text-[#2F2B2D]">{vitals.heartRate}</span>
            <span className="text-xs text-[#7B7280] font-mono">BPM</span>
          </div>

          <p className="text-[10px] text-[#7B7280]">
            Status: {vitals.heartRate > 100 ? 'Elevated Pulse' : 'Normal Resting Rate'}
          </p>

          {/* Animated Sine-wave pulse simulation */}
          <div className="w-full h-7 bg-[#FFF8F9] rounded-lg border border-[#E9D8DE] flex items-center justify-center overflow-hidden">
            <div className="text-[#A70F43] font-mono text-[10px] animate-pulse">
              /\_/\_/\___________/\_/\_/\
            </div>
          </div>
        </div>

        {/* Stress Level Gauge Card */}
        <div className="bg-white border border-[#E9D8DE] rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#E9D8DE] pb-2">
            <span className="text-xs font-bold text-[#7B7280] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#A70F43]" />
              Stress Index
            </span>
            <span className="text-[9px] font-mono font-bold bg-[#A70F43] text-white px-2 py-0.5 rounded">
              0 - 100
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-mono font-black text-[#2F2B2D]">{vitals.stressLevel}%</span>
            <span className="text-xs text-[#7B7280] font-mono">Stress</span>
          </div>

          <div className="w-full bg-[#E9D8DE] h-2.5 rounded-full overflow-hidden border border-[#E9D8DE]">
            <div
              className={`h-full transition-all ${
                vitals.stressLevel > 70 ? 'bg-rose-500' : vitals.stressLevel > 40 ? 'bg-amber-400' : 'bg-[#A70F43]'
              }`}
              style={{ width: `${vitals.stressLevel}%` }}
            ></div>
          </div>

          <p className="text-[10px] text-[#7B7280]">
            HRV (Variability): <strong className="text-[#2F2B2D] font-mono">{vitals.hrv} ms</strong>
          </p>
        </div>

        {/* Spike Protection & Settings */}
        <div className="bg-white border border-[#E9D8DE] rounded-2xl p-5 shadow-sm space-y-3">
          <div className="border-b border-[#E9D8DE] pb-2">
            <h3 className="text-xs font-bold text-[#2F2B2D] flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#A70F43]" />
              Spike Threshold Alert Rules
            </h3>
            <p className="text-[10px] text-[#7B7280] mt-0.5">Automated emergency check if BPM spikes while stationary</p>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-[#7B7280] mb-1 font-semibold text-[11px]">
                <span>Alert Threshold:</span>
                <span className="text-[#2F2B2D] font-mono font-bold">{spikeThresholdBpm} BPM</span>
              </div>
              <input
                type="range"
                min="110"
                max="180"
                value={spikeThresholdBpm}
                onChange={(e) => setSpikeThresholdBpm(parseInt(e.target.value))}
                className="w-full accent-[#A70F43] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE]">
              <span className="text-[#2F2B2D] text-[11px] font-semibold">Auto SOS on Spike</span>
              <input
                type="checkbox"
                checked={autoSosOnSpike}
                onChange={(e) => setAutoSosOnSpike(e.target.checked)}
                className="w-4 h-4 accent-[#A70F43]"
              />
            </div>

            <button
              onClick={handleSimulateSpike}
              className="w-full py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-[#8D0D39] shadow-sm"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simulate Heart Rate Spike (148 BPM)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

