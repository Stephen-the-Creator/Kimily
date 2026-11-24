import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({ root: __dirname, plugins: [svelte()], build: { minify: false, sourcemap: false, outDir: "/tmp/neonprev", emptyOutDir: true }, base: "./" });
