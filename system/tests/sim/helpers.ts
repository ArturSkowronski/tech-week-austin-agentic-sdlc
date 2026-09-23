// Shared scaffolding for the replay tests. A replay test builds a world from a
// text map, feeds it a fixed list of input frames and asserts the result, so
// every helper here is deterministic and free of wall time.

import { createWorld, NO_INPUT, tick } from '../../game/sim/index';
import type { CreateWorldOptions, InputFrame, WorldState } from '../../game/sim/index';

/**
 * Strip the indentation a template literal adds, so a map can be written in
 * place at the indentation of the test. The leading newline and any trailing
 * blank lines go; the shallowest indented line decides how much is removed, so
 * columns stay aligned with each other.
 */
function dedent(text: string): string {
  const lines = text.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);

  return lines.map((line) => line.slice(common)).join('\n');
}

/** A world from an inline text map, indentation of the literal removed. */
export function worldFrom(text: string, options: CreateWorldOptions = {}): WorldState {
  return createWorld(dedent(text), options);
}

/** Step the world through the frames, in order. Returns the same state. */
export function run(state: WorldState, frames: readonly InputFrame[]): WorldState {
  for (const frame of frames) {
    tick(state, frame);
  }

  return state;
}

/** `ticks` copies of one frame; the buttons left out are not held. */
export function hold(input: Partial<InputFrame>, ticks: number): InputFrame[] {
  const frame: InputFrame = { ...NO_INPUT, ...input };

  return Array.from({ length: ticks }, () => frame);
}
