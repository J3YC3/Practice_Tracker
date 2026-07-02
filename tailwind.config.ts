import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        moss: "#315d49",
        mint: "#dff3e8",
        clay: "#c76b4b",
        paper: "#f7f5ef"
      }
    }
  },
  plugins: []
};

export default config;
