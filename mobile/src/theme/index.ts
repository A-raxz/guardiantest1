import { Platform } from 'react-native';

export const colors = {
  bg: '#0B1220',
  surface: '#141C2E',
  surfaceAlt: '#1B2438',
  border: '#26314A',
  primary: '#4C7DFF',
  primarySoft: '#1E2C55',
  accent: '#FFC44D',
  success: '#3DD68C',
  successSoft: '#123A2B',
  danger: '#FF6B6B',
  dangerSoft: '#3A1A1F',
  warning: '#FFA94D',
  text: '#F3F6FC',
  textMuted: '#98A4BC',
  textFaint: '#68758F',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  title: { fontSize: 21, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textFaint },
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 6 },
  default: {},
}) as object;

/** Colour used to represent a completion percentage anywhere in the app. */
export function percentColor(percent: number): string {
  if (percent >= 100) return colors.success;
  if (percent >= 50) return colors.primary;
  if (percent > 0) return colors.warning;
  return colors.textFaint;
}

export const roleColor: Record<string, string> = {
  MASTER_ADMIN: '#C792FF',
  HR_BP: '#4C7DFF',
  SALES_MANAGER: '#3DD68C',
  SALES_REP: '#FFC44D',
};
