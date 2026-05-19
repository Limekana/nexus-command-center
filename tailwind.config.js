/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '14px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0, 212, 255, 0.2), 0 0 24px -4px rgba(0, 212, 255, 0.25)',
      },
    },
  },
  plugins: [],
};
