import React from 'react';
import {
  MapPin,
  Shield,
  Radio,
  AlertTriangle,
  Phone,
  Volume2,
  Watch,
  Scale,
  Users,
  Lock,
  Accessibility,
  Sparkles,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { GuardIaLogo } from './GuardIaLogo';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTriggerSos: () => void;
  isOffline: boolean;
  setIsOffline: (val: boolean) => void;
  isRecordingVault: boolean;
  heartRate: number;
  movementSensorsActive: boolean;
  userName?: string;
  onLogout?: () => void;
  onBackToHome?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onTriggerSos,
  userName = 'Shreya',
  onLogout,
  onBackToHome,
}) => {
  // Dynamic greeting based on time of day
  const hour = new Date().getHours();
  let timeGreeting = 'Good afternoon';
  if (hour < 12) timeGreeting = 'Good morning';
  else if (hour > 17) timeGreeting = 'Good evening';

  const bottomDockItems = [
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'routes', label: 'Routes', icon: Shield },
    { id: 'accessibility', label: 'Access', icon: Accessibility },
    { id: 'vault', label: 'Vault', icon: Lock },
    { id: 'vitals', label: 'Vitals', icon: Watch },
  ];

  // Secondary tools quick launcher (non-duplicate, clean module switcher)
  const quickFeatureChips = [
    { id: 'sensors', label: 'Sensors', icon: Radio },
    { id: 'legal', label: 'Legal Advisor', icon: Scale },
    { id: 'community', label: 'Community', icon: Users },
    { id: 'toolkit', label: 'Offline Toolkit', icon: Phone },
    { id: 'companion', label: 'AI Companion', icon: Volume2 },
  ];

  const getSectionHeader = (tab: string) => {
    switch (tab) {
      case 'routes':
        return { title: 'Safe Routes & Navigation', subtitle: 'AI lighted & crime-monitored paths' };
      case 'accessibility':
        return { title: 'Accessibility & Mobility', subtitle: 'Ramp access & sidewalk audit' };
      case 'vault':
        return { title: 'Evidence Vault', subtitle: 'Encrypted cloud audio & video logs' };
      case 'vitals':
        return { title: 'Vitals & Sensor Stream', subtitle: 'Real-time biometric & crash monitoring' };
      case 'sensors':
        return { title: 'Sensors & Fall Detector', subtitle: 'Automated impact & anomaly sensing' };
      case 'legal':
        return { title: 'Legal & Rights Advisor', subtitle: 'Instant legal aid & FIR guidance' };
      case 'community':
        return { title: 'Community Safety Network', subtitle: 'Nearby verified helpers & reports' };
      case 'toolkit':
        return { title: 'Offline Emergency Toolkit', subtitle: 'Siren, fake call & SMS broadcast' };
      case 'companion':
        return { title: 'AI Voice Safety Guardian', subtitle: 'Real-time conversational protection' };
      default:
        return { title: 'Safera Personal Safety', subtitle: 'Personal Safety & Access' };
    }
  };

  const isHomepage = activeTab === 'map';
  const sectionHeaderInfo = getSectionHeader(activeTab);

  return (
    <>
      {/* Top Greeting Header (Visual Anchor matching Screenshot) */}
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7 pb-3">
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Left Greeting on Homepage, Section Title on other tabs */}
          <div className="min-w-0 flex-1">
            {isHomepage ? (
              <>
                <h1 className="text-2xl xs:text-3xl sm:text-[34px] font-bold text-[#8A1E41] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                  {timeGreeting}, {userName}
                </h1>
                <p className="text-sm sm:text-[15px] font-medium text-[#825D6B] mt-1">
                  Stay Safe with Safera
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl xs:text-3xl sm:text-[32px] font-bold text-[#8A1E41] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                  {sectionHeaderInfo.title}
                </h1>
                <p className="text-sm sm:text-[15px] font-medium text-[#825D6B] mt-1">
                  {sectionHeaderInfo.subtitle}
                </p>
              </>
            )}
          </div>

          {/* Right Header Controls: Back to Home + SOS Alert + Logo Badge + Logout */}
          <div className="flex items-center space-x-2.5 sm:space-x-4 shrink-0">
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#F2E5DE] text-[#825D6B] hover:text-[#8A1E41] hover:border-[#8A1E41]/30 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
                title="Back to Home"
              >
                <ArrowLeft className="w-4 h-4" /> Home
              </button>
            )}

            {/* Header SOS Emergency Button */}
            <button
              onClick={onTriggerSos}
              className="px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-full bg-[#8A1E41] hover:bg-[#6D1533] text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Trigger Immediate SOS Emergency Alert"
              id="header-sos-button"
            >
              <AlertTriangle className="w-4 h-4 fill-white text-[#8A1E41] animate-pulse" />
              <span className="hidden sm:inline">SOS Alert</span>
            </button>

            {/* Circular Safera Logo Badge matching SS */}
            <GuardIaLogo size="md" variant="icon" showText={false} />

            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2.5 rounded-full bg-white border border-[#F2E5DE] text-[#825D6B] hover:text-[#8A1E41] hover:border-[#8A1E41]/30 transition-all cursor-pointer"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Floating Bottom Navigation Dock (Always Visible) */}
      <div className="fixed bottom-5 inset-x-0 z-40 max-w-lg mx-auto px-4 pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md border border-[#F2E5DE] rounded-full p-2 shadow-[0_12px_36px_rgba(49,20,30,0.1)] flex items-center justify-between">
          {bottomDockItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 px-3.5 rounded-full transition-all cursor-pointer ${
                  isActive
                    ? 'text-[#8A1E41] font-semibold'
                    : 'text-[#825D6B] hover:text-[#31141E]'
                }`}
                id={`bottom-dock-${item.id}`}
              >
                <div
                  className={`p-1.5 rounded-full transition-all ${
                    isActive ? 'bg-[#F7E5EC]' : 'bg-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] mt-0.5">{item.label}</span>
              </button>
            );
          })}

          {/* Prominent Floating SOS Button in Bottom Dock */}
          <button
            onClick={onTriggerSos}
            className="flex items-center justify-center p-3.5 rounded-full bg-[#8A1E41] hover:bg-[#6D1533] text-white shadow-lg shadow-[#8A1E41]/30 active:scale-95 transition-all cursor-pointer"
            title="Dispatch SOS Emergency Alert"
            id="floating-sos-dock-button"
          >
            <AlertTriangle className="w-5 h-5 fill-white text-[#8A1E41] animate-pulse" />
          </button>
        </div>
      </div>
    </>
  );
};