import type { Config } from "tailwindcss";

const config: Config = {
  // OJO: este proyecto NO tiene carpeta src/ — el código vive en app/, lib/
  // y components/. Si se olvida una carpeta, Tailwind BORRA sus clases al
  // compilar y la interfaz sale rota (pasó el 3-ago con components/).
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
        dark: {
          900: "#0f172a",
          800: "#1e293b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
