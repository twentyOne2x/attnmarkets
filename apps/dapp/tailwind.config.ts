// apps/dapp/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // UPDATED: Match landing page exactly
        primary: '#14F195',      // ← Changed to match landing
        secondary: '#7C3AED',    // ← Changed to match landing  
        accent: '#D946EF',       // ← Changed to match landing
        dark: '#0B0E11',         // ← Changed to match landing
        'dark-card': '#111315',  // ← Changed to match landing
        'text-primary': '#EDEFF2',   // ← Changed to match landing
        'text-secondary': '#9CA3AF', // ← Changed to match landing
        success: '#16A34A',      // ← Changed to match landing
        warning: '#FBBF24',      // ← Changed to match landing
        error: '#DC2626',        // ← Changed to match landing
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['IBM Plex Mono', 'monospace']
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config