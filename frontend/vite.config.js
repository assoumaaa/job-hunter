import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	build: {
		outDir: "build",
	},
	resolve: {
		alias: {
			actions: path.resolve(__dirname, "./src/actions"),
			components: path.resolve(__dirname, "./src/components"),
			models: path.resolve(__dirname, "./src/models"),
			pages: path.resolve(__dirname, "./src/pages"),
			services: path.resolve(__dirname, "./src/services"),
			utils: path.resolve(__dirname, "./src/utils"),
		},
	},
	plugins: [react(), tailwindcss()],
	server: {
		proxy: {
			// Backend serves the API under /api in both dev and prod, so forward
			// the prefix as-is (no rewrite).
			"/api": {
				target: "http://localhost:8000",
			},
		},
	},
});
