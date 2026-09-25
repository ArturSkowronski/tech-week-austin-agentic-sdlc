import { writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';

import { defineConfig, type Connect, type Plugin } from 'vite';

// The game is a static site; the built dist/ is what Cloudflare Workers serves
// (ADR-007, docs/plan/02-design/ci-and-deploy.md).

/**
 * The two directories the trace tool saves into: the room module it traced,
 * and the painting panels a room is traced over (ADR-004, level-design.md,
 * painting a room). Nothing else on the disk is writable from the page.
 */
const ROOMS = 'game/content/rooms';
const RAWS = 'assets';

/** The names a room may be saved under (level-design.md, painting a room). */
const NAME = /^[a-z][a-z0-9-]*$/;

/** A painting is up to three panels, numbered from one (ADR-004). */
const PANELS = 3;

/** A room name, refused unless the level design's own pattern allows it. */
function nameOf(value: unknown): string {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new Error(`not a room name: ${JSON.stringify(value)}`);
  }

  return value;
}

/** A panel number, refused unless a painting could hold that panel. */
function panelOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > PANELS) {
    throw new Error(`not a panel of a painting: ${JSON.stringify(value)}`);
  }

  return value;
}

/**
 * The bytes a save carries. Checked like the name and the panel are, so a body
 * that names a file but brings nothing to put in it is refused instead of
 * writing the string `undefined` into game/content/rooms/.
 */
function textOf(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`not the contents of a file: ${JSON.stringify(value)}`);
  }

  return value;
}

/** The whole request body, as the JSON the tool posted. */
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

/** One save endpoint: what a posted body writes, and where. */
type Target = (posted: Record<string, unknown>) => { file: string; data: Buffer };

/**
 * A POST that writes one file. The path is built from a checked name rather
 * than taken from the request, so no body can name a file outside the two
 * directories above, and a refusal answers 400 instead of writing anything.
 */
function endpoint(root: string, target: Target): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (request.method !== 'POST') {
      next();
      return;
    }

    void (async (): Promise<void> => {
      try {
        const { file, data } = target(await body(request));

        await writeFile(join(root, file), data);
        response.statusCode = 200;
        response.end(file);
      } catch (error) {
        response.statusCode = 400;
        response.end(String(error));
      }
    })();
  };
}

/**
 * The trace tool's save, which only the dev server offers: the built site is
 * static and has nothing to write to (ADR-004 traces collision in a browser
 * tool, and the tool hands its result back to the repository through here).
 */
function traceSaver(): Plugin {
  return {
    name: 'hobby-wizard:trace-saver',
    apply: 'serve',
    configureServer(server) {
      const { root } = server.config;

      server.middlewares.use(
        '/__trace/room',
        endpoint(root, (posted) => ({
          file: join(ROOMS, `${nameOf(posted['name'])}.ts`),
          data: Buffer.from(textOf(posted['source']), 'utf8'),
        })),
      );

      server.middlewares.use(
        '/__trace/painting',
        endpoint(root, (posted) => ({
          file: join(RAWS, `painting-${nameOf(posted['name'])}-${panelOf(posted['panel'])}.png`),
          data: Buffer.from(textOf(posted['png']), 'base64'),
        })),
      );
    },
  };
}

export default defineConfig({
  plugins: [traceSaver()],
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
