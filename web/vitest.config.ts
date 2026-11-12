import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Map the "@/..." import alias (tsconfig paths) to the project root for tests.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
