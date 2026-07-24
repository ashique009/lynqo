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
        light: {
          bg: '#FCEEF3',
          card: '#ffffff',
          border: '#F4C0D1',
          text: '#2C2C2A',
          muted: '#5F5E5A',
          accent: '#D4537E',
          'accent-hover': '#c2436d',
          'accent-secondary': '#F0997B',
        },
      },
    },
  },
  plugins: [],
};
