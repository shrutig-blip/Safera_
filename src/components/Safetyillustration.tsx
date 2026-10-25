import React from 'react';

interface SafetyIllustrationProps {
  className?: string;
}

// Original flat-vector illustration (no real person, no stock photo) built
// to echo the reference screenshot: a woman walking away with a backpack,
// checking her phone, a soft city skyline behind her, and a dashed route
// leading to a location pin above her — all in the app's own palette.
export const SafetyIllustration: React.FC<SafetyIllustrationProps> = ({ className = '' }) => {
  return (
    <svg viewBox="0 0 320 460" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Soft city skyline silhouette */}
      <g opacity="0.5">
        <rect x="0" y="330" width="46" height="110" rx="4" fill="#F6DEE7" />
        <rect x="52" y="300" width="36" height="140" rx="4" fill="#F2D3DF" />
        <rect x="94" y="345" width="30" height="95" rx="4" fill="#F6DEE7" />
        <path d="M124 345 L139 320 L154 345 Z" fill="#F2D3DF" />
        <rect x="230" y="310" width="34" height="130" rx="4" fill="#F2D3DF" />
        <rect x="268" y="350" width="30" height="90" rx="4" fill="#F6DEE7" />
        <rect x="196" y="360" width="28" height="80" rx="4" fill="#F6DEE7" />
      </g>

      {/* Dashed route from the pin down toward her */}
      <path
        d="M70 40 C 40 90, 120 120, 100 175"
        fill="none"
        stroke="#D89AAE"
        strokeWidth="2.5"
        strokeDasharray="1 10"
        strokeLinecap="round"
      />
      {/* Location pin */}
      <g transform="translate(52, 6)">
        <circle cx="18" cy="18" r="26" fill="#F7E5EC" opacity="0.7" />
        <path
          d="M18 2C9.7 2 3 8.7 3 17c0 11.6 15 25 15 25s15-13.4 15-25c0-8.3-6.7-15-15-15Z"
          fill="#8A1E41"
        />
        <circle cx="18" cy="17" r="6" fill="#FFFFFF" />
      </g>

      {/* Ground shadow */}
      <ellipse cx="160" cy="438" rx="66" ry="12" fill="#8A1E41" opacity="0.08" />

      {/* Figure — walking away, three-quarter back view */}
      <g>
        {/* Backpack (drawn first so only its edges peek out past the jacket) */}
        <rect x="118" y="162" width="88" height="86" rx="18" fill="#F2E5DE" stroke="#E3CFC4" strokeWidth="1.5" />
        <rect x="130" y="174" width="30" height="9" rx="4.5" fill="#E3CFC4" />
        <g transform="translate(150, 190)">
          <path d="M12 0C5 0 0 5.4 0 11.2c0 7.8 12 17.4 12 17.4s12-9.6 12-17.4C24 5.4 19 0 12 0Z" fill="#8A1E41" />
          <path
            d="M12 7.6c-1.3-1.7-3.9-1.7-5.3 0-1.4 1.7-1.2 4 .7 6.2L12 18l4.6-4.2c1.9-2.2 2.1-4.5.7-6.2-1.4-1.7-4-1.7-5.3 0Z"
            fill="#FFFFFF"
          />
        </g>

        {/* Backpack straps over the shoulders */}
        <path d="M138 152c-4 8-6 16-6 24" stroke="#C9647B" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M196 152c4 8 6 16 6 24" stroke="#C9647B" strokeWidth="7" strokeLinecap="round" fill="none" />

        {/* Jacket / torso — simple rounded silhouette */}
        <path
          d="M138 148 Q135 180 148 212 Q140 250 143 292 L203 292 Q206 250 198 212 Q211 180 208 148 Q173 132 138 148 Z"
          fill="#E37E93"
        />
        <path
          d="M138 148 Q173 132 208 148 Q198 140 173 138 Q150 138 138 148 Z"
          fill="#C9647B"
          opacity="0.5"
        />

        {/* Far arm sleeve, just a hint along the side */}
        <path d="M133 156c-7 10-10 24-8 40 1 10 4 20 8 28l11-5c-4-14-6-27-5-40 1-9 3-17 6-24-4 0-8 0-12 1Z" fill="#D9738C" />

        {/* Near arm, bent up holding the phone */}
        <path
          d="M199 150c11 2 18 10 21 21 3 10 1 21-4 28l-12-6c4-8 5-16 3-23-2-6-5-10-10-13 0-3 1-5 2-7Z"
          fill="#EB8CA0"
        />
        <circle cx="216" cy="197" r="10" fill="#C98B6C" />
        <rect x="209" y="185" width="12" height="21" rx="3" fill="#31141E" />
        <rect x="211.5" y="188" width="7" height="12" rx="1.5" fill="#8AD6C8" opacity="0.85" />

        {/* Ponytail */}
        <path d="M195 100c9 5 14 15 12 27-2 13-9 23-7 35-9 0-15-9-14-21 1-16 3-31 9-41Z" fill="#2E2024" />

        {/* Head */}
        <circle cx="172" cy="112" r="25" fill="#C98B6C" />
        {/* Hair cap */}
        <path
          d="M148 108c0-16 11-28 25-28 15 0 26 12 26 27 0 5-1 9-1 9-4-8-13-13-24-13-9 0-17 4-22 10-2-2-4-3-4-5Z"
          fill="#2E2024"
        />

        {/* Legs */}
        <path d="M154 292c-2 26-4 52-8 76l14 2c6-24 10-50 12-76Z" fill="#2E2024" />
        <path d="M192 292c4 26 8 52 14 76l-14 2c-8-24-12-50-16-76Z" fill="#221820" />

        {/* Shoes */}
        <ellipse cx="154" cy="372" rx="12" ry="6" fill="#8A1E41" />
        <ellipse cx="202" cy="372" rx="12" ry="6" fill="#6D1533" />
      </g>
    </svg>
  );
};