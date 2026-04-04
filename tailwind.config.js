/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Claude's signature warm orange/terracotta palette
        brand: {
          50:  '#fdf4f0',
          100: '#fae5d8',
          200: '#f5c9b0',
          300: '#eeaa88',
          400: '#e48a62',
          500: '#da7756',  // Claude's primary accent
          600: '#c4623e',
          700: '#a34e30',
          800: '#7f3c23',
          900: '#5e2c18',
        },
        // Claude's dark surface palette
        surface: {
          dark:    '#1a1a1a',
          darker:  '#141414',
          card:    '#212121',
          border:  '#2f2f2f',
          hover:   '#2a2a2a',
          muted:   '#3a3a3a',
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.22s ease-out both',
        'fade-in':    'fadeIn 0.18s ease-out both',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
