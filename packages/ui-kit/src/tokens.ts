export const brand = {
  pitchBlack: '#000000',
  technicaGold: '#877232',
  platinum: '#CCCCCC',
  lightGold: '#DECA8C',
  pureWhite: '#FFFFFF',
} as const;

export const tokens = {
  color: {
    background: brand.pureWhite,
    surface: '#F5F5F5',
    surfaceDark: brand.pitchBlack,
    border: brand.platinum,
    text: brand.pitchBlack,
    textMuted: '#595959',
    textOnDark: brand.pureWhite,
    accentOnDark: brand.lightGold,
    primary: brand.technicaGold,
    primaryContrast: brand.pureWhite,
    danger: '#B91C1C',
    warning: '#B45309',
    success: '#047857',
    focusRing: brand.technicaGold,
  },
  space: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    6: '24px',
    8: '32px',
  },
  font: {
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    size: {
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
    },
  },
  radius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
} as const;

export type Tokens = typeof tokens;
export type Brand = typeof brand;
