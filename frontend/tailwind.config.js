/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Explicit 'class' (never toggled) rather than 'media': this is a single light
  // theme matching assiduous.tech, not a light/dark toggle - a stray `dark:` class
  // must never silently activate just because the OS is set to dark mode.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F2",
        // Key is named "navy" for historical/backward-compat reasons (widely
        // referenced as text-navy/border-navy/bg-navy across the app) but the value
        // is the exact brand near-black (#1B1D24), not actually navy blue.
        navy: {
          DEFAULT: "#1B1D24",
          hover: "#2A2D36",
        },
        // Exact brand red extracted from the official logo asset (src/assets/assiduous_logo.png).
        coral: {
          DEFAULT: "#EB3446",
          hover: "#C82C3C",
        },
        muted: "#6B7280",
        "surface-border": "#E5E1DA",
        destructive: {
          DEFAULT: "#B91C1C",
          hover: "#991B1B",
        },
      },
      boxShadow: {
        // Two-layer ambient shadow (tight contact shadow + soft diffuse spread)
        // reads as "barely there" rather than a hard drop shadow.
        card: "0 1px 2px rgba(27, 29, 36, 0.04), 0 4px 12px rgba(27, 29, 36, 0.04)",
        "card-hover": "0 2px 4px rgba(27, 29, 36, 0.05), 0 8px 24px rgba(27, 29, 36, 0.08)",
      },
      keyframes: {
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        "modal-in": {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(4px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "overlay-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "tooltip-in": {
          "0%": { opacity: "0", transform: "translate(-50%, -4px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        indeterminate: "indeterminate 1.4s ease-in-out infinite",
        "modal-in": "modal-in 200ms ease-out",
        "overlay-in": "overlay-in 200ms ease-out",
        "tooltip-in": "tooltip-in 150ms ease-out",
        "toast-in": "toast-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};
