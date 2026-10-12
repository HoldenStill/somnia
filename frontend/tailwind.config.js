/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        surface: '#121215',
        'surface-hover': '#18181b',
        card: '#18181b',
        border: '#27272a',
        'border-subtle': '#1f1f23',
        primary: {
          50: '#f0fdfa',
          500: '#14b8a6',
          600: '#0d9488',
        },
        accent: {
          teal: '#2dd4bf',
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 12px #2dd4bf' },
          '50%': { opacity: 0.4, boxShadow: '0 0 4px #2dd4bf' },
        }
      }
    },
  },
  plugins: [],
}
