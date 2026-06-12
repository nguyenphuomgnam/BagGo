/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#edf9f2",
          100: "#d7f1e2",
          200: "#afe3c7",
          300: "#7dd0a4",
          400: "#4abb80",
          500: "#1DAA65",
          600: "#128B4D",
          700: "#0d6f3e",
          800: "#0b5833",
          900: "#073b24",
        },
        ink: "#050505",
        paper: "#FFFFFF",
      },
      backdropBlur: {
        xs: "2px",
      }
    },
  },
  plugins: [],
}
