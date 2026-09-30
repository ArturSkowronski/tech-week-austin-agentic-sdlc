// What a raw is, and which raws the provenance record accounts for
// (docs/plan/03-assets/pipeline.md, invariants). The report asks here rather
// than writing the rule out itself, and a test can read it without running a
// script. The build keeps its own reading of `assets/` for now (build.ts).

import { readdir } from 'node:fs/promises';

/** The raw art, and the record of how it was made, which is not one of them. */
export const RAWS = 'assets';
export const RECORD = 'PROVENANCE.md';

/** The record's table: `File | What it is | Becomes`. */
const COLUMNS = 3;

/** Every raw in `assets/`: the files there, the record itself apart. */
export async function rawNames(): Promise<string[]> {
  const entries = await readdir(RAWS, { withFileTypes: true });

  return entries.filter((entry) => entry.isFile() && entry.name !== RECORD).map((entry) => entry.name);
}

/**
 * The cells of a table row, or nothing if the line is not one: a row is
 * delimited at both ends and carries the table's columns, so neither prose
 * that happens to start with a bar nor a half-written `| tileset.png` counts.
 */
function cellsOf(line: string): string[] | undefined {
  const text = line.trim();

  if (!text.startsWith('|') || !text.endsWith('|')) return undefined;

  const cells = text.slice(1, -1).split('|');

  return cells.length === COLUMNS ? cells.map((cell) => cell.trim()) : undefined;
}

/** Every raw the record's tables name in no first column, in the order given. */
export function rawsWithoutProvenance(raws: readonly string[], record: string): string[] {
  const rows = new Set(
    record
      .split('\n')
      .map(cellsOf)
      .filter((cells) => cells !== undefined)
      .map((cells) => cells[0]),
  );

  return raws.filter((raw) => !rows.has(raw));
}
