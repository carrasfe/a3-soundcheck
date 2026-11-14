import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror tsconfig "paths" so tests can import modules that use "@/..."
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
