import { defineConfig } from 'vite';

// The game is a static site; the built dist/ is what Cloudflare Workers serves
// (ADR-007, docs/plan/02-design/ci-and-deploy.md).
export default defineConfig({
  build: {
    outDir: 'dist',
    // The bundle goes to dist/bundle/ so dist/assets/ stays exactly what the
    // asset kit wrote into public/assets/ — the build later fails on any stray
    // file there (docs/plan/02-design/asset-pipeline.md).
    assetsDir: 'bundle',
    // Same language level tsconfig.json type-checks against; one answer to
    // "what does this ship".
    target: 'es2023',
  },
  server: {
    port: 5173,
  },
  // No preview.port here on purpose: playwright.config.ts passes
  // `--port <PORT> --strictPort` and is the single source for the preview port.
});
