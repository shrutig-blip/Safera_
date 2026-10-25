import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface SafetyCheckOverlayProps {
  activeCountdown: number | null;
  activeAlarmType: string | null;
  onConfirmSafe: () => void;
  onDispatchNow: () => void;
}

/**
 * Renders on top of whatever tab the person is currently viewing — mounted
 * once at the App root alongside useMotionSafetyDetection, so a shake/fall
 * detected while browsing the map, vault, or any other tab still surfaces
 * this countdown instead of being silently caught only on the Sensors tab.
 */
export const SafetyCheckOverlay: React.FC<SafetyCheckOverlayProps> = ({
  activeCountdown,
  activeAlarmType,
  onConfirmSafe,
  onDispatchNow,
}) => {
  if (activeCountdown === null) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border-2 border-[#A70F43] rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 text-center text-[#2F2B2D]">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#A70F43] text-white flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-white fill-white animate-pulse" />
        </div>

        <div>
          <span className="text-xs uppercase font-mono font-bold text-[#A70F43] tracking-wider">
            Unusual Motion Event
          </span>
          <h3 className="text-lg font-extrabold text-[#2F2B2D] mt-1">{activeAlarmType}</h3>
          <p className="text-xs text-[#7B7280] mt-1.5">
            Safera detected an abnormal movement pattern. Confirm safety within the countdown or an
            emergency SOS alert will be dispatched automatically.
          </p>
        </div>

        <div className="my-3">
          <div className="text-4xl font-mono font-black text-[#A70F43] animate-pulse">
            00:{activeCountdown < 10 ? `0${activeCountdown}` : activeCountdown}
          </div>
          <span className="text-[10px] text-[#7B7280]">Seconds remaining until SOS dispatch</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onConfirmSafe}
            className="py-2.5 rounded-xl bg-[#FFF8F9] hover:bg-[#FFF0F3] text-[#2F2B2D] border border-[#E9D8DE] font-bold text-xs transition-colors"
          >
            I AM SAFE (Dismiss)
          </button>
          <button
            onClick={onDispatchNow}
            className="py-2.5 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs transition-colors shadow-sm border border-[#8D0D39]"
          >
            DISPATCH SOS NOW
          </button>
        </div>
      </div>
    </div>
  );
};