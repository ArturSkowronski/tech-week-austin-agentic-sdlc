// `pnpm assets:report`: every output the kit wrote, with what consumes it, and
// every raw the provenance record has no row for (docs/plan/03-assets/pipeline.md,
// invariants). The answers come from consumers.ts and provenance.ts rather
// than from this file, so the report never states a rule of its own; the build
// still reads `assets/` its own way, which is a follow-up on build.ts.
// A missing manifest throws, because there is nothing to report without it;
// a raw with no row is printed and leaves the exit code non-zero.

import { readFile } from 'node:fs/promises';

import { type Manifest } from '../../game/render/sprites';

import { consumerOf, roomNames } from './consumers';
import { RAWS, RECORD, rawNames, rawsWithoutProvenance } from './provenance';

/** What the kit last wrote, which is what there is to report on. */
const MANIFEST = 'public/assets/manifest.json';

async function main(): Promise<void> {
  const [rooms, text, raws, record] = await Promise.all([
    roomNames(),
    readFile(MANIFEST, 'utf8').catch(() => {
      throw new Error(`${MANIFEST} is missing; run pnpm assets`);
    }),
    rawNames(),
    readFile(`${RAWS}/${RECORD}`, 'utf8'),
  ]);

  for (const name of Object.keys(JSON.parse(text) as Manifest)) {
    process.stdout.write(`${name} ${consumerOf(name, rooms) ?? 'nothing'}\n`);
  }

  const unrecorded = rawsWithoutProvenance(raws, record);

  for (const raw of unrecorded) process.stdout.write(`${RAWS}/${raw} no ${RECORD} row\n`);

  if (unrecorded.length > 0) process.exitCode = 1;
}

await main();
