import React from 'react';

interface GuardIaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'badge';
  showText?: boolean;
}

export const GuardIaLogo: React.FC<GuardIaLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
}) => {
  const sizeMap = {
    sm: 'w-10 h-10 p-2',
    md: 'w-14 h-14 p-2.5',
    lg: 'w-16 h-16 p-3',
    xl: 'w-20 h-20 p-3.5',
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`${currentSize} rounded-[22px] bg-white shadow-[0_6px_20px_rgba(138,30,65,0.12)] border border-[#F2E5DE] flex items-center justify-center shrink-0 transition-transform hover:scale-105 cursor-pointer`}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xs">
          {/* Location Pin in Rich Cherry Red matching image */}
          <path
            d="M50 8 C30 8 14 24 14 44 C14 68 50 94 50 94 C50 94 86 68 86 44 C86 24 70 8 50 8 Z"
            fill="#8A1E41"
          />
          {/* Heart Cutout in Soft White */}
          <path
            d="M50 36 C45 30 35 30 30 36 C25 42 26 50 33 56 L50 71 L67 56 C74 50 75 42 70 36 C65 30 55 30 50 36 Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>

      {showText && (
        <div className="leading-tight">
          <div className="font-bold text-lg text-[#31141E] flex items-center gap-0.5">
            <span className="text-[#8A1E41]">Safera</span>
          </div>
          <div className="text-xs font-medium text-[#825D6B]">
            Personal Safety & Access
          </div>
        </div>
      )}
    </div>
  );
};




