/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        freshGreen: "#10B981",
        freshGreenLight: "#34D399",
        freshGreenDark: "#059669",
        touristBg: "#F8FAFC",
        touristCard: "#FFFFFF",
      },
      backdropBlur: {
        xs: "2px",
      }
    },
  },
  plugins: [],
}

