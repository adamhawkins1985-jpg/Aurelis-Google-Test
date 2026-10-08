import React from 'react';

interface AurelisLogoProps {
  className?: string;
  variant?: 'full' | 'mark-only';
  color?: string; // Optional custom color override for text/emblem
  accentColor?: string; // Color for the cyan emblem and 'E' top bar (defaults to #00F5D4)
}

export const AurelisLogo: React.FC<AurelisLogoProps> = ({
  className = 'h-4 w-auto',
  variant = 'full',
  color,
  accentColor = '#00F5D4',
}) => {
  // If variant is just the mark/emblem (used in minimized dock, icons, etc.)
  if (variant === 'mark-only') {
    return (
      <svg
        className={className}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Aurelis Emblem"
      >
        <g fill={color || accentColor}>
          {/* Upper Chevron with inner cutout and curved bottom */}
          <path
            d="M 50 4
               L 85 64
               C 65 48, 35 48, 15 64
               Z
               M 50 24
               L 34 50
               C 43 43, 57 43, 66 50
               Z"
            fillRule="evenodd"
          />
          {/* Lower Arched Crescent Swoosh */}
          <path
            d="M 2 94
               C 28 66, 72 66, 98 94
               C 70 77, 30 77, 2 94
               Z"
          />
        </g>
      </svg>
    );
  }

  // Full Wordmark Logo: Dynamic Delta Emblem + "A U R E L I S"
  // Note: The top bar of 'E' is highlighted in accentColor (#00F5D4), matching the exact brand artwork
  return (
    <svg
      className={className}
      viewBox="0 0 560 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Aurelis"
    >
      {/* 1. Left Emblem (Vibrant Cyan) */}
      <g fill={accentColor}>
        {/* Upper Chevron */}
        <path
          d="M 50 4
             L 85 64
             C 65 48, 35 48, 15 64
             Z
             M 50 24
             L 34 50
             C 43 43, 57 43, 66 50
             Z"
          fillRule="evenodd"
        />
        {/* Lower Crescent Arch */}
        <path
          d="M 2 94
             C 28 66, 72 66, 98 94
             C 70 77, 30 77, 2 94
             Z"
        />
      </g>

      {/* 2. Wordmark Letters: A U R E L I S */}
      <g fill={color || 'currentColor'}>
        {/* A (Open Chevron, No Crossbar) */}
        <path d="M 152 20 L 186 80 L 171 80 L 152 44 L 133 80 L 118 80 Z" />

        {/* U (Squarish Rounded Base) */}
        <path d="M 198 20 L 211 20 L 211 63 C 211 69, 215 72, 222 72 L 232 72 C 239 72, 243 69, 243 63 L 243 20 L 256 20 L 256 63 C 256 75, 247 80, 232 80 L 222 80 C 207 80, 198 75, 198 63 Z" />

        {/* R (Technical Geometric R) */}
        <path d="M 268 20 L 305 20 C 316 20, 321 26, 321 35 C 321 43, 316 49, 306 50 L 322 80 L 307 80 L 293 52 L 281 52 L 281 80 L 268 80 Z M 281 42 L 303 42 C 307 42, 309 40, 309 35 C 309 31, 307 29, 303 29 L 281 29 Z" />

        {/* E Body: Vertical Stem, Middle Bar, Bottom Bar (Base color) */}
        <path d="M 333 32 L 346 32 L 346 46 L 376 46 L 376 54 L 346 54 L 346 71 L 383 71 L 383 80 L 333 80 Z" />

        {/* L (Geometric L) */}
        <path d="M 395 20 L 408 20 L 408 71 L 445 71 L 445 80 L 395 80 Z" />

        {/* I (Clean Stem) */}
        <path d="M 457 20 L 470 20 L 470 80 L 457 80 Z" />

        {/* S (Futuristic Square-Curve S) */}
        <path d="M 482 20 L 535 20 L 535 29 L 496 29 C 495 35, 495 38, 496 42 L 526 44 C 535 45, 538 50, 538 61 C 538 74, 530 80, 514 80 L 482 80 L 482 71 L 515 71 C 522 71, 524 67, 524 61 C 524 55, 520 53, 513 52 L 493 50 C 485 49, 482 43, 482 32 Z" />
      </g>

      {/* 3. The Signature Cyan Accent Bar on Top of 'E' */}
      <path
        d="M 333 20 L 385 20 L 385 29 L 382 32 L 336 32 L 333 29 Z"
        fill={accentColor}
      />
    </svg>
  );
};
