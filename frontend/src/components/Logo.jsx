import React from "react";

export default function Logo({ width = "150", height = "36", idSuffix = "", ...props }) {
  const maskId = idSuffix ? `ticketMaskLogo-${idSuffix}` : "ticketMaskLogo";
  const gradId = idSuffix ? `goldGrad-${idSuffix}` : "goldGrad";

  return (
    <svg width={width} height={height} viewBox="0 0 300 72" overflow="visible" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8bf6c" />
          <stop offset="100%" stopColor="#c99a3c" />
        </linearGradient>
      </defs>

      {/* Icon: same shape as the favicon — rounded ticket body with
           concave left/right notches, center perforation */}
      <mask id={maskId}>
        <rect x="4" y="12" width="52" height="40" rx="10" fill="white" />
        <circle cx="4" cy="32" r="7.5" fill="black" />
        <circle cx="56" cy="32" r="7.5" fill="black" />
      </mask>

      <rect x="4" y="12" width="52" height="40" rx="10" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />

      <line x1="30" y1="19" x2="30" y2="45"
            stroke="#1e2030" strokeWidth="3"
            strokeDasharray="3.2 4.2" strokeLinecap="round" opacity="0.55" />

      {/* Wordmark — clean, upright, no italic/tilt, matching the simpler
           flat icon style */}
      <text x="76" y="46"
            fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
            fontWeight="900"
            fontSize="30"
            letterSpacing="0.5"
            fill="#f7f2e7">
        STAGE<tspan fill={`url(#${gradId})`}>PASS</tspan>
      </text>
    </svg>
  );
}
