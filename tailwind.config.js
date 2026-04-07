/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // iOS blue system color
        brand: {
          50:  '#EBF5FF',
          100: '#D6EBFF',
          200: '#ADCEFF',
          300: '#7AB8FF',
          400: '#4DA3FF',
          500: '#007AFF',
          600: '#0071E3',
          700: '#005ECB',
          800: '#004AAD',
          900: '#003080',
        },
        // iOS system grays
        ios: {
          bg:        '#F2F2F7',   // iOS system background secondary
          card:      '#FFFFFF',
          separator: '#E5E5EA',
          label:     '#000000',
          label2:    '#3C3C43',   // secondary label (60% opacity)
          label3:    '#3C3C4399', // tertiary
          gray1:     '#8E8E93',   // iOS gray
          gray2:     '#AEAEB2',
          gray3:     '#C7C7CC',
          gray4:     '#D1D1D6',
          gray5:     '#E5E5EA',
          gray6:     '#F2F2F7',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'SF Pro Display'", "'SF Pro Text'", 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'ios':    '13px',
        'ios-lg': '20px',
        'ios-xl': '28px',
      },
      boxShadow: {
        'ios-sm': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)',
        'ios':    '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        'ios-md': '0 4px 16px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        'ios-lg': '0 8px 32px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)',
      },
      backdropBlur: {
        'ios': '20px',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.22s ease-out both',
        'fade-in':    'fadeIn 0.18s ease-out both',
        'ios-spring': 'iosSpring 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
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
      },
      letterSpacing: {
        'ios-tight': '-0.3px',
        'ios-wide':  '0.6px',
      },
    },
  },
  plugins: [],
}
