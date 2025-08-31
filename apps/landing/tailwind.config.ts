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
        primary: '#14F195',
        secondary: '#7C3AED',
        accent: '#D946EF',
        dark: '#0B0E11',
        'dark-card': '#111315',
        'text-primary': '#EDEFF2',
        'text-secondary': '#9CA3AF',
        success: '#16A34A',
        warning: '#FBBF24',
        error: '#DC2626'
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['IBM Plex Mono', 'monospace']
      }
    },
  },
  plugins: [],
}
export default config