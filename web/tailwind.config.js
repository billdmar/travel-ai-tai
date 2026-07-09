/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm off-white surfaces — the base canvas.
        canvas: {
          DEFAULT: 'rgb(var(--canvas) / <alpha-value>)',
          raised: 'rgb(var(--canvas-raised) / <alpha-value>)',
          sunken: 'rgb(var(--canvas-sunken) / <alpha-value>)',
        },
        // Charcoal ink — text and structure (warm-neutral, never pure black).
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
          line: 'rgb(var(--ink-line) / <alpha-value>)',
        },
        // The ONE accent: a muted blue-green. Tints/shades only.
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
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
        // High-contrast serif for headlines. Cormorant Garamond, falling back
        // to Playfair Display / Georgia. Body/UI stay on `sans` (Inter).
        serif: [
          'Cormorant Garamond Variable',
          'Cormorant Garamond',
          'Playfair Display',
          'Georgia',
          'serif',
        ],
      },
      maxWidth: {
        container: '72rem', // 1152px — generous reading/composition width
      },
      letterSpacing: {
        tightish: '-0.011em',
      },
      // "Quiet luxury" motion tokens — slow, eased, deliberate; no bounce.
      // Values are defined as CSS vars in index.css so the whole site shares a
      // single source of truth. Other terminals reference these, never hardcode.
      transitionTimingFunction: {
        lux: 'var(--ease-lux)',
      },
      transitionDuration: {
        reveal: 'var(--dur-reveal)',
        route: 'var(--dur-route)',
        hover: 'var(--dur-hover)',
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
