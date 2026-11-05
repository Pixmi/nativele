import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({ plugins: [tsDom({ dirs: ["src/nv"] }), react()] });
