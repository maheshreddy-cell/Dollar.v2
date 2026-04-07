/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // iOS Blue — remapped so ALL existing brand-600 classes → iOS blue automatically
        brand: {
          50:  '#EBF5FF',
          100: '#D6EBFF',
          200: '#ADCEFF',
          300: '#7AB8FF',
          400: '#4DA3FF',
          500: '#007AFF',  // iOS system blue
          600: '#007AFF',  // same — remap so existing brand-600 = iOS blue
          700: '#0071E3',  // darker hover
          800: '#005ECB',
          900: '#003080',
        },
        // iOS system grays
        ios: {
          bg:        '#F2F2F7',
          card:      '#FFFFFF',
          separator: '#E5E5EA',
          gray1:     '#8E8E93',
          gray2:     '#AEAEB2',
          gray3:     '#C7C7CC',
          gray4:     '#D1D1D6',
          gray5:     '#E5E5EA',
          gray6:     '#F2F2F7',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont',
          "'SF Pro Display'", "'SF Pro Text'",
          'system-ui', 'sans-serif',
          "'Apple Color Emoji'", "'Segoe UI Emoji'", "'Noto Color Emoji'",
        ],
      },
      borderRadius: {
        'ios':    '12px',
        'ios-lg': '18px',
        'ios-xl': '26px',
      },
      boxShadow: {
        'ios-xs': '0 1px 2px rgba(0,0,0,0.06)',
        'ios-sm': '0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)',
        'ios':    '0 2px 10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        'ios-md': '0 4px 20px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.06)',
        'ios-lg': '0 8px 36px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.07)',
      },
      animation: {
        'fade-in-up':  'fadeInUp 0.22s ease-out both',
        'fade-in':     'fadeIn 0.18s ease-out both',
        'ios-spring':  'iosSpring 0.38s cubic-bezier(0.34, 1.5, 0.64, 1) both',
        'ios-press':   'iosPress 0.12s ease-out both',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        iosSpring: {
          from: { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        iosPress: {
          from: { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.97)' },
          to:   { transform: 'scale(1)' },
        },
      },
      letterSpacing: {
        'ios-tight': '-0.3px',
        'ios-wide':  '0.5px',
      },
    },
  },
  plugins: [],
}
