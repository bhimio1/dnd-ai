/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'cinzel': ['Cinzel', 'serif'],
        'solway': ['Solway', 'serif'],
      },
      colors: {
        'parchment': '#f4e7d3',
        'dnd-red': '#8e1111',
      },
      backgroundImage: {
        'parchment-texture': "url('https://www.transparenttextures.com/patterns/parchment.png')",
      }
    },
  },
  plugins: [],
}
