// The one frame of input the simulation consumes per tick
// (docs/plan/02-design/simulation-architecture.md). Keyboard mapping lives in
// the renderer's input layer; the simulation only ever sees these five booleans,
// so a recorded session (frames plus seed) replays anywhere.

/** The buttons held on one tick. Recorded per tick, replayable. */
export interface InputFrame {
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly charge: boolean;
  readonly down: boolean;
}

/** The all-false frame: nothing held. */
export const NO_INPUT: InputFrame = {
  left: false,
  right: false,
  jump: false,
  charge: false,
  down: false,
};
