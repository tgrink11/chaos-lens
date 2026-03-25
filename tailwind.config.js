/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chaos: {
          900: '#f5f7fa',
          800: '#ffffff',
          700: '#d0d5dd',
          600: '#d0d5dd',
          500: '#667085',
        },
        fractal: {
          green: '#0a7a2e',
          red: '#912323',
          amber: '#b45309',
          purple: '#7c3aed',
          cyan: '#114f78',
          pink: '#be185d',
        },
      },
    },
  },
  plugins: [],
};
