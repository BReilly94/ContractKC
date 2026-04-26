import type { CSSProperties } from 'react';

export type LogoVariant = 'horizontal' | 'vertical' | 'mark';
export type LogoTone = 'black' | 'white' | 'gray';

export interface LogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  width?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

const MIN_WIDTH_PX: Record<LogoVariant, number> = {
  horizontal: 180,
  vertical: 130,
  mark: 42,
};

const VIEWBOX: Record<LogoVariant, { w: number; h: number }> = {
  horizontal: { w: 680, h: 150 },
  vertical: { w: 420, h: 320 },
  mark: { w: 200, h: 140 },
};

const INNER_CIRCLE_DIAMETER = 40;

const TONE_COLOR: Record<LogoTone, string> = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#CCCCCC',
};

function MarkPaths() {
  return (
    <g>
      <ellipse cx="102" cy="70" rx="88" ry="60" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M 56 16 A 62 62 0 0 0 56 124" stroke="currentColor" strokeWidth="24" fill="none" />
      <circle cx="112" cy="70" r="20" fill="currentColor" />
      <rect x="132" y="66" width="60" height="8" fill="currentColor" />
      <rect x="185" y="56" width="7" height="28" fill="currentColor" />
    </g>
  );
}

export function Logo({
  variant = 'horizontal',
  tone = 'black',
  width,
  title = 'Technica Mining',
  className,
  style,
}: LogoProps) {
  const { w, h } = VIEWBOX[variant];
  const rendered = width ?? MIN_WIDTH_PX[variant];

  if (process.env.NODE_ENV !== 'production' && rendered < MIN_WIDTH_PX[variant]) {
    // Brand guide p.6: minimum screen widths are 180 / 130 / 42 for horizontal / vertical / mark.
    // eslint-disable-next-line no-console
    console.warn(
      `[Logo] width ${rendered}px is below the ${variant} minimum (${MIN_WIDTH_PX[variant]}px). See Technica brand guidelines page 6.`,
    );
  }

  const clearSpacePx = Math.round((rendered * INNER_CIRCLE_DIAMETER) / w);

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    padding: `${clearSpacePx}px`,
    color: TONE_COLOR[tone],
    lineHeight: 0,
    ...style,
  };

  return (
    <span className={className} style={containerStyle} data-ckb-logo={variant} data-ckb-tone={tone}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${w} ${h}`}
        width={rendered}
        height={rendered * (h / w)}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        {variant === 'mark' && <MarkPaths />}
        {variant === 'horizontal' && (
          <>
            <MarkPaths />
            <text
              x="230"
              y="104"
              fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
              fontSize="82"
              fontWeight="800"
              fill="currentColor"
            >
              Technica Mining
            </text>
          </>
        )}
        {variant === 'vertical' && (
          <>
            <g transform="translate(110 20)">
              <MarkPaths />
            </g>
            <text
              x="210"
              y="280"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
              fontSize="56"
              fontWeight="800"
              fill="currentColor"
            >
              Technica Mining
            </text>
          </>
        )}
      </svg>
    </span>
  );
}
