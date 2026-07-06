// Simple esbuild build script - no bundler config file needed.
// Produces plain JS (no React/Vue/etc runtime) from the TypeScript sources.
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const watch = process.argv.includes("--watch");

// Content scripts (content.js, inject.js) must NOT be ES modules - Chrome
// loads them as classic scripts unless declared otherwise, so we bundle
// those as IIFEs. The background service worker is declared as
// "type": "module" in manifest.json, and popup.html loads its script with
// type="module", so those two stay ESM.
const entries = [
  { in: "src/background.ts", out: "dist/background.js", format: "esm" },
  { in: "src/content/index.ts", out: "dist/content.js", format: "iife" },
  { in: "src/content/inject.ts", out: "dist/inject.js", format: "iife" },
  { in: "src/popup/popup.ts", out: "popup/popup.js", format: "esm" },
];

const buildOptions = entries.map(({ in: entryPoint, out: outfile, format }) => ({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format,
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
}));

// popup.html and popup.css are static files, not TS entry points, so
// esbuild never touches them - they have to be copied by hand into the
// popup/ directory that manifest.json's default_popup actually points to.
// (This was the missing piece that made the popup 404 in Chrome.)
const staticFiles = [
  { from: "src/popup/popup.html", to: "popup/popup.html" },
  { from: "src/popup/popup.css", to: "popup/popup.css" },
];

function copyStaticFiles() {
  for (const { from, to } of staticFiles) {
    mkdirSync(new URL(`./${to.split("/").slice(0, -1).join("/")}/`, import.meta.url), { recursive: true });
    copyFileSync(new URL(`./${from}`, import.meta.url), new URL(`./${to}`, import.meta.url));
  }
  console.log("Copied popup static files.");
}

async function run() {
  copyStaticFiles();
  if (watch) {
    const contexts = await Promise.all(buildOptions.map((opts) => esbuild.context(opts)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("Watching for changes...");
  } else {
    await Promise.all(buildOptions.map((opts) => esbuild.build(opts)));
    console.log("Build complete.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
