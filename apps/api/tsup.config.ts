import { defineConfig } from "tsup";

// Workspace packages ship TypeScript source, so they're bundled in; npm dependencies stay external.
export default defineConfig({
  entry: ["src/main.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: [/^@repo\//],
});
