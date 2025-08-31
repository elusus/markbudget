import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: '#0e6a8d',
        sidebarDark: '#095571',
        sidebarLight: '#107aa3',
        panel: '#f7fbfd',
      },
      boxShadow: {
        panel: '0 1px 3px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
} satisfies Config
