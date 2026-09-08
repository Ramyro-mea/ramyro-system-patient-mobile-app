export const lightColors = {
  background: '#f8fafc', surface: '#ffffff', surfaceMuted: '#f1f5f9',
  text: '#0f172a', textMuted: '#64748b', border: '#e2e8f0',
  primary: '#0ea5e9', primaryDark: '#2563eb', accent: '#4f46e5',
  success: '#047857', successSurface: '#ecfdf5', warning: '#b45309',
  warningSurface: '#fffbeb', danger: '#dc2626', dangerSurface: '#fef2f2',
  white: '#ffffff', overlay: 'rgba(15, 23, 42, 0.55)', skeleton: '#cbd5e1',
};

export const darkColors = {
  background: '#0a0f1e', surface: '#0f172a', surfaceMuted: '#1e293b',
  text: '#f8fafc', textMuted: '#94a3b8', border: '#273449',
  primary: '#38bdf8', primaryDark: '#3b82f6', accent: '#6366f1',
  success: '#6ee7b7', successSurface: 'rgba(16, 185, 129, 0.16)',
  warning: '#fde68a', warningSurface: 'rgba(245, 158, 11, 0.17)',
  danger: '#fca5a5', dangerSurface: 'rgba(127, 29, 29, 0.48)',
  white: '#ffffff', overlay: 'rgba(2, 6, 23, 0.82)', skeleton: '#334155',
};

export type AppColors = typeof lightColors;
