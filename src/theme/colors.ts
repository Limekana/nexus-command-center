// Cyber Slate — selected theme per spec
export const colors = {
  // Backgrounds
  bg:       '#0D1117',
  surface:  '#161B22',
  surface2: '#1C2128',
  border:   '#30363D',

  // Brand
  primary:    '#00D4FF',
  primaryDim: '#00A8CC',

  // Text
  text:      '#E6EDF3',
  textMuted: '#7D8590',

  // Semantic
  danger:  '#F85149',
  success: '#3FB950',
  warning: '#D29922',

  // Always
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorKey = keyof typeof colors;
