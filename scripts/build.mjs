// Builds the pages into dist/: the app bundled from web/src, plus everything in web/public as is.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
cpSync("web/public", "dist", { recursive: true });
await build({
  entryPoints: { app: "web/src/main.js", style: "web/src/style.css" },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: process.env.NODE_ENV !== "development",
  sourcemap: true,
  external: ["/fonts/*"],
  logLevel: "info",
});
