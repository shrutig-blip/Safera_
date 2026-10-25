import React from 'react';
import { MovementSensorSettings } from '../types';
import { GuardIaLogo } from './GuardIaLogo';
import { Radio, AlertTriangle, ShieldCheck, Clock, Zap, Smartphone, Activity, CheckCircle2, Sliders, Volume2 } from 'lucide-react';

interface MovementDetectionProps {
  settings: MovementSensorSettings;
  onUpdateSettings: (newSettings: MovementSensorSettings) => void;
  onTriggerSos: () => void;
  /** Live G-force reading from the app-root motion listener (see useMotionSafetyDetection). */
  gForce: number;
  /** Lets the simulator buttons here reuse the exact same countdown flow as a real detection. */
  triggerSafetyCheck: (reason: string) => void;
}

export const MovementDetection: React.FC<MovementDetectionProps> = ({
  settings,
  onUpdateSettings,
  onTriggerSos,
  gForce,
  triggerSafetyCheck,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner Control Header */}
      <div className="bg-white border border-[#EFE6E1] rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Radio className="w-5 h-5 text-[#A70F43] animate-pulse" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#EFE6E1]">
                  AI Sensor Safeguard
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[#221F20] tracking-tight mt-1">
                AI-Powered Sensor & Movement Detection
              </h2>
              <p className="text-[15px] text-[#6E676A] mt-1">
                Monitors smartphone & watch sensors for sudden falls, violent shaking, dragging, or prolonged inactivity — runs in the background across every tab, not just this screen.
              </p>
            </div>
          </div>

          {/* Master Toggle Button */}
          <button
            onClick={() => onUpdateSettings({ ...settings, isEnabled: !settings.isEnabled })}
            className={`px-5 py-2.5 rounded-full text-xs font-semibold border transition-all flex items-center space-x-2 shadow-xs ${
              settings.isEnabled
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#6E676A] border-[#EFE6E1]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>AI Sensor Detection: {settings.isEnabled ? 'ACTIVE' : 'DISABLED'}</span>
          </button>
        </div>
      </div>

      {/* Sensor Config & Live G-Force Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white border border-[#E9D8DE] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-[#E9D8DE] pb-2">
            <h3 className="text-xs font-bold text-[#2F2B2D] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#A70F43]" />
              Live Accelerometer Reading
            </h3>
            <p className="text-[10px] text-[#7B7280] mt-0.5">
              Real-time motion magnitude from your device's sensors (1.0G = at rest)
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-[#2F2B2D]">Current G-Force</span>
              <span className="font-mono font-bold text-[#A70F43]">{gForce.toFixed(2)}G</span>
            </div>
            <div className="w-full h-2.5 bg-[#FFF0F3] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  gForce > 3.0 ? 'bg-[#A70F43]' : 'bg-[#5FA777]'
                }`}
                style={{ width: `${Math.min(100, (gForce / 5.0) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Individual Motion Checkers */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE]">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-[#A70F43]" />
                <span className="font-semibold text-[#2F2B2D]">Sudden Fall Detection</span>
              </div>
              <input
                type="checkbox"
                checked={settings.fallDetection}
                onChange={(e) => onUpdateSettings({ ...settings, fallDetection: e.target.checked })}
                className="w-4 h-4 accent-[#A70F43]"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE]">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-[#A70F43]" />
                <span className="font-semibold text-[#2F2B2D]">Violent Shaking / Struggle Detector</span>
              </div>
              <input
                type="checkbox"
                checked={settings.shakingDetection}
                onChange={(e) => onUpdateSettings({ ...settings, shakingDetection: e.target.checked })}
                className="w-4 h-4 accent-[#A70F43]"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE]">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-[#A70F43]" />
                <span className="font-semibold text-[#2F2B2D]">Dragging / Sudden Acceleration</span>
              </div>
              <input
                type="checkbox"
                checked={settings.draggingDetection}
                onChange={(e) => onUpdateSettings({ ...settings, draggingDetection: e.target.checked })}
                className="w-4 h-4 accent-[#A70F43]"
              />
            </div>

            {/* Prolonged Inactivity Settings */}
            <div className="p-3 rounded-xl bg-[#FFF8F9] border border-[#E9D8DE] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-[#A70F43]" />
                  <span className="font-semibold text-[#2F2B2D]">Inactivity Check-In Timer</span>
                </div>
                <span className="font-mono text-[#A70F43] font-bold">{settings.inactivityThresholdHours} Hours</span>
              </div>

              <p className="text-[10px] text-[#7B7280]">
                Pops up an automatic safety check-in prompt if no movement or app interaction occurs for {settings.inactivityThresholdHours} hours.
              </p>

              <input
                type="range"
                min="1"
                max="12"
                value={settings.inactivityThresholdHours}
                onChange={(e) => onUpdateSettings({ ...settings, inactivityThresholdHours: parseInt(e.target.value) })}
                className="w-full accent-[#A70F43] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Interactive Sensor Test Pad */}
        <div className="lg:col-span-6 bg-white border border-[#E9D8DE] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-[#E9D8DE] pb-2">
            <h3 className="text-xs font-bold text-[#2F2B2D] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#A70F43]" />
              Interactive Sensor Event Simulator
            </h3>
            <p className="text-xs text-[#7B7280] mt-0.5">
              Test how Safera responds to abnormal motion triggers safely
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <button
              onClick={() => triggerSafetyCheck('Sudden High-Impact Fall (Simulated)')}
              className="p-3 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
            >
              <div className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-[#A70F43]" />
                <span>Simulate Fall Event</span>
              </div>
              <p className="text-[10px] text-[#7B7280]">Simulates 4.8G vertical drop and impact stillness.</p>
            </button>

            <button
              onClick={() => triggerSafetyCheck('Violent Shaking / Defense Struggle (Simulated)')}
              className="p-3 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
            >
              <div className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#A70F43]" />
                <span>Simulate Violent Struggle</span>
              </div>
              <p className="text-[10px] text-[#7B7280]">Simulates rapid multi-axis phone shaking spikes.</p>
            </button>

            <button
              onClick={() => triggerSafetyCheck('Sudden Dragging / High Acceleration (Simulated)')}
              className="p-3 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
            >
              <div className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#A70F43]" />
                <span>Simulate Forced Dragging</span>
              </div>
              <p className="text-[10px] text-[#7B7280]">Simulates abrupt speed increase & linear pulling motion.</p>
            </button>

            <button
              onClick={() => triggerSafetyCheck(`Inactivity Check (${settings.inactivityThresholdHours}h Timer Expiry)`)}
              className="p-3 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] border border-[#E9D8DE] hover:border-[#A70F43] text-left space-y-1 transition-all"
            >
              <div className="font-bold text-[#2F2B2D] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#A70F43]" />
                <span>Simulate Inactivity Expiry</span>
              </div>
              <p className="text-[10px] text-[#7B7280]">
                Pops up safety check notification after idle duration.
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};