// `pnpm assets:report`: every output the kit wrote, with what consumes it
// (docs/plan/03-assets/pipeline.md, invariants). The answers come from
// consumers.ts, which is what the build fails on, so the report and the build
// can never disagree about who wants a file.

import { readFile } from 'node:fs/promises';

import { type Manifest } from '../../game/render/sprites';

import { consumerOf, roomNames } from './consumers';

/** What the kit last wrote, which is what there is to report on. */
const MANIFEST = 'public/assets/manifest.json';

async function main(): Promise<void> {
  const rooms = await roomNames();
  const text = await readFile(MANIFEST, 'utf8').catch(() => {
    throw new Error(`${MANIFEST} is missing; run pnpm assets`);
  });

  for (const name of Object.keys(JSON.parse(text) as Manifest)) {
    process.stdout.write(`${name} ${consumerOf(name, rooms) ?? 'nothing'}\n`);
  }
}

await main();
