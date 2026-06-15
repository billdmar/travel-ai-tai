/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm off-white surfaces — the base canvas.
        canvas: {
          DEFAULT: '#faf8f4', // page background (warm white)
          raised: '#ffffff', // cards / framed surfaces
          sunken: '#f1eee7', // subtle wells, hovers
        },
        // Charcoal ink — text and structure (warm-neutral, never pure black).
        ink: {
          DEFAULT: '#2b2a28',
          soft: '#55524d', // secondary text
          faint: '#8a857d', // captions, credits
          line: '#e7e2d9', // hairline borders
        },
        // The ONE accent: a muted blue-green. Tints/shades only.
        accent: {
          50: '#eef4f3',
          100: '#d6e6e3',
          200: '#aecdc8',
          300: '#82b0a9',
          400: '#5a938b',
          500: '#3f7a72', // primary accent
          600: '#33645d',
          700: '#2a504b',
          800: '#223f3b',
          900: '#1b322f',
        },
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      maxWidth: {
        container: '72rem', // 1152px — generous reading/composition width
      },
      letterSpacing: {
        tightish: '-0.011em',
      },
      boxShadow: {
        frame: '0 1px 2px rgba(43,42,40,0.04), 0 12px 32px -12px rgba(43,42,40,0.18)',
        lift: '0 2px 4px rgba(43,42,40,0.05), 0 24px 48px -16px rgba(43,42,40,0.22)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translate(-50%, 8px)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 200ms ease-out',
      },
    },
  },
  plugins: [],
}
