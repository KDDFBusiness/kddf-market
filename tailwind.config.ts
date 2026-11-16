import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0B0B10", 900: "#111118", 800: "#181822", 700: "#22222F" },
        volt: { DEFAULT: "#6366F1", soft: "#818CF8", deep: "#4F46E5" },
        jade: { DEFAULT: "#10B981", soft: "#34D399" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99,102,241,.35), 0 12px 40px -12px rgba(99,102,241,.45)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { rise: "rise .5s ease-out both" },
    },
  },
  plugins: [],
};

export default config;
