/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── v1.0 Cyber Slate base ─────────────────────────────────────────
        bg: '#0D1117',
        surface: '#161B22',
        surface2: '#1C2128',
        border: '#30363D',
        primary: {
          DEFAULT: '#00D4FF',
          dim: '#00A8CC',
        },
        text: {
          DEFAULT: '#E6EDF3',
          muted: '#7D8590',
        },
        danger: '#F85149',
        success: '#3FB950',
        warning: '#D29922',
        // ─── v1.2 Glass layer ──────────────────────────────────────────────
        // Use as backgrounds via `bg-glass`, `bg-glass-strong`, etc. The
        // values are pre-mixed rgba so they composite with whatever sits
        // behind (ambient mesh on the root, or other glass panes for the
        // sheet-over-card case).
        glass: {
          DEFAULT: 'rgba(28, 33, 40, 0.55)',  // panel / card
          strong: 'rgba(22, 27, 34, 0.78)',   // modal / sheet / nav
          soft:   'rgba(28, 33, 40, 0.38)',   // floating chip / hover
          border: 'rgba(125, 133, 144, 0.18)',
          'border-strong': 'rgba(125, 133, 144, 0.28)',
          highlight: 'rgba(255, 255, 255, 0.06)',
        },
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '14px',
        xl: '20px',
        pill: '999px',
      },
      backdropBlur: {
        // Named tiers so usage reads intent ("nav" / "panel" / "sheet")
        // rather than a magic px value. S24 chews through all three at 60fps.
        nav: '14px',
        glass: '18px',
        sheet: '28px',
      },
      boxShadow: {
        // Pre-existing — kept for any caller still using shadow-glow.
        glow: '0 0 0 1px rgba(0, 212, 255, 0.2), 0 0 24px -4px rgba(0, 212, 255, 0.25)',
        // v1.2 glass shadow stack — inset hairline + outer drop. The inset
        // gives the "lit top edge" that sells the glass illusion; the outer
        // drop gives separation from the ambient mesh underneath.
        glass: '0 1px 0 inset rgba(255,255,255,0.06), 0 8px 24px -12px rgba(0,0,0,0.5)',
        'glass-lg': '0 1px 0 inset rgba(255,255,255,0.08), 0 16px 48px -16px rgba(0,0,0,0.6)',
        // Accent-lit variant for active/highlighted glass (selected tab, hot
        // signal pill in Insights). Cyan inner glow instead of white.
        'glass-glow': '0 1px 0 inset rgba(0, 212, 255, 0.22), 0 8px 32px -10px rgba(0, 212, 255, 0.22), 0 0 0 1px rgba(0, 212, 255, 0.32)',
      },
      transitionTimingFunction: {
        // Overshoot spring — for press feedback, pill toggles, FAB pop.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        // Smooth exponential — for page fades, list staggers, sheet slide.
        // No overshoot; ends with a soft glide.
        'spring-soft': 'cubic-bezier(0.16, 1, 0.3, 1)',
        // Quick decel — for taps and state flips that need to land fast.
        decel: 'cubic-bezier(0, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '60%':  { opacity: '1', transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        'sheet-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'sheet-down': {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.20), 0 0 18px -4px rgba(0, 212, 255, 0.20)' },
          '50%':      { boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.40), 0 0 28px -2px rgba(0, 212, 255, 0.40)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in':     'pop-in 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'sheet-up':   'sheet-up 340ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-down': 'sheet-down 240ms cubic-bezier(0.4, 0, 1, 1) both',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
