import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: /^@workspace\/db$/,
        replacement: path.resolve(import.meta.dirname, "../../lib/db/src/index.ts"),
      },
      {
        find: /^@workspace\/db\/schema$/,
        replacement: path.resolve(import.meta.dirname, "../../lib/db/src/schema/index.ts"),
      },
      {
        find: /^@workspace\/api-zod$/,
        replacement: path.resolve(import.meta.dirname, "../../lib/api-zod/src/index.ts"),
      },
    ],
  },
});
