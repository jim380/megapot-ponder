import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    exclude: [
      "node_modules/**",
      "mcp-server/**"
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "test/",
        "generated/",
        "*.config.ts",
        "*.config.js",
        "src/index.ts",
        "**/index.ts",
        "src/types*.ts",
        "src/handlers/base.ts",
      ],
      include: ["src*.ts"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/generated": path.resolve(__dirname, "./test/mocks/ponder-registry.ts"),
      "ponder:registry": path.resolve(
        __dirname,
        "./test/mocks/ponder-registry.ts"
      ),
      "ponder:schema": path.resolve(
        __dirname,
        "./test/mocks/ponder-registry.ts"
      ),
    },
  },
});
