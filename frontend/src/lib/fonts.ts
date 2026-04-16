import { Inter } from "next/font/google";

/** Variable font: un solo archivo, menos peticiones que pesos sueltos */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
