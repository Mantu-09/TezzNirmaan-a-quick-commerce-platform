// ─────────────────────────────────────────────────────
// TezzNirmaan Design Token System
//
// Color story:
//   Amber (#E8740C) = Tezz (speed, energy, saffron / Indian identity)
//   Navy  (#0D3B6E) = Nirmaan (construction, reliability, steel)
//   Warm white bg  = polished concrete, not clinical white
// ─────────────────────────────────────────────────────

export const Colors = Object.freeze({
  // ── Brand ──────────────────────────────────────────
  primary:        '#E8740C',  // amber-orange
  primaryDark:    '#BF5A00',  // pressed / active
  primaryLight:   '#FFF3E6',  // tinted bg for badges
  primaryText:    '#FFFFFF',  // text on primary bg

  secondary:      '#0D3B6E',  // deep navy
  secondaryDark:  '#07254A',
  secondaryLight: '#E8F0F8',  // tinted bg
  secondaryText:  '#FFFFFF',

  // ── Backgrounds ────────────────────────────────────
  background:     '#F7F6F3',  // warm off-white (main app bg)
  surface:        '#FFFFFF',  // cards, modals
  surface2:       '#F0EFE9',  // subtle dividers, input bg
  overlay:        'rgba(0,0,0,0.45)',

  // ── Text ───────────────────────────────────────────
  text:           '#18181B',  // primary text
  textSecondary:  '#71717A',  // secondary / helper
  textTertiary:   '#A1A1AA',  // placeholder / disabled
  textInverse:    '#FFFFFF',

  // ── Borders ────────────────────────────────────────
  border:         '#E4E4E7',
  borderFocus:    '#E8740C',

  // ── Semantic ───────────────────────────────────────
  success:        '#16A34A',
  successLight:   '#DCFCE7',
  error:          '#DC2626',
  errorLight:     '#FEE2E2',
  warning:        '#D97706',
  warningLight:   '#FEF3C7',
  info:           '#2563EB',
  infoLight:      '#DBEAFE',

  // ── Delivery Tiers ─────────────────────────────────
  quick:          '#E8740C',  // amber — speed
  quickLight:     '#FFF3E6',
  quickText:      '#7C3A00',

  scheduled:      '#0D3B6E',  // navy — planned
  scheduledLight: '#E8F0F8',
  scheduledText:  '#051E3A',

  // ── Misc ───────────────────────────────────────────
  skeleton:       '#E9E9E6',  // skeleton loader base
  skeletonShimmer:'#F5F5F2',
  transparent:    'transparent',
});

export const Typography = Object.freeze({
  // Font families — Inter for Latin, system fallback includes Noto Sans for Devanagari
  fontFamily: {
    regular:    'Inter-Regular',
    medium:     'Inter-Medium',
    semiBold:   'Inter-SemiBold',
    bold:       'Inter-Bold',
    // System fallback handles Devanagari script for Hindi product names/addresses
    system:     'System',
  },

  // Scale (px, ~sp equivalent)
  size: {
    xs:   10,
    sm:   12,
    base: 14,
    md:   16,
    lg:   18,
    xl:   20,
    '2xl':24,
    '3xl':28,
    '4xl':32,
    '5xl':40,
  },

  // Line heights
  leading: {
    tight:  1.2,
    snug:   1.375,
    normal: 1.5,
    relaxed:1.625,
  },

  // Letter spacing
  tracking: {
    tight:  -0.5,
    normal:  0,
    wide:    0.5,
    wider:   1,
  },
});

export const Spacing = Object.freeze({
  0:   0,
  1:   4,
  2:   8,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  7:   28,
  8:   32,
  10:  40,
  12:  48,
  16:  64,
  20:  80,
  24:  96,
});

export const BorderRadius = Object.freeze({
  none:   0,
  sm:     4,
  md:     8,
  lg:     12,
  xl:     16,
  '2xl':  20,
  '3xl':  24,
  full:   9999,
});

export const Shadow = Object.freeze({
  none: {},
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
});

// Convenience: common text styles
export const TextStyles = {
  h1: { fontSize: Typography.size['3xl'], fontFamily: Typography.fontFamily.bold,    lineHeight: Typography.size['3xl'] * Typography.leading.tight,  color: Colors.text },
  h2: { fontSize: Typography.size['2xl'], fontFamily: Typography.fontFamily.bold,    lineHeight: Typography.size['2xl'] * Typography.leading.tight,  color: Colors.text },
  h3: { fontSize: Typography.size.xl,    fontFamily: Typography.fontFamily.semiBold, lineHeight: Typography.size.xl    * Typography.leading.snug,   color: Colors.text },
  h4: { fontSize: Typography.size.lg,    fontFamily: Typography.fontFamily.semiBold, lineHeight: Typography.size.lg    * Typography.leading.snug,   color: Colors.text },
  body: { fontSize: Typography.size.base,  fontFamily: Typography.fontFamily.regular, lineHeight: Typography.size.base  * Typography.leading.normal, color: Colors.text },
  bodyMd: { fontSize: Typography.size.md,    fontFamily: Typography.fontFamily.regular, lineHeight: Typography.size.md    * Typography.leading.normal, color: Colors.text },
  caption: { fontSize: Typography.size.sm,    fontFamily: Typography.fontFamily.regular, lineHeight: Typography.size.sm    * Typography.leading.normal, color: Colors.textSecondary },
  label: { fontSize: Typography.size.sm,    fontFamily: Typography.fontFamily.medium,  lineHeight: Typography.size.sm    * Typography.leading.normal, color: Colors.text },
  tiny: { fontSize: Typography.size.xs,    fontFamily: Typography.fontFamily.regular, lineHeight: Typography.size.xs    * Typography.leading.normal, color: Colors.textTertiary },
};

// Layout helpers
export const Layout = {
  productCard: { width: '48%' },
  tabBarHeight: 60,
  headerHeight: 56,
  screenPadding: Spacing[4],
};

export default { Colors, Typography, Spacing, BorderRadius, Shadow, TextStyles, Layout };
