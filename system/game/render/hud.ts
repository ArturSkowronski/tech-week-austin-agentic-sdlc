// The line in the corner: which room this is, and, behind F1, what the
// simulation is doing (docs/plan/02-design/rendering-and-look.md, UI).

import { Container } from 'pixi.js';

import type { WorldState } from '../sim';
import { UI_COLOURS, UI_SIZES } from './config';
import { createText, textReport, uiScale } from './panel';

/**
 * The HUD's line: the room's name, and behind F1 the labels a run is read
 * with — the player's state and its timer, the tick, and the deaths so far.
 * Every one of them comes off the state, so the line replays with the run.
 */
export function hudLine(state: WorldState, debug: boolean): string {
  const { player } = state;

  if (!debug) {
    return state.roomName;
  }

  return [
    state.roomName,
    `${player.state} ${player.stateTimer}`,
    `x ${Math.round(player.x)} y ${Math.round(player.y)}`,
    `tick ${state.tick}`,
    `deaths ${state.deaths}`,
  ].join('  ');
}

export interface Hud {
  readonly view: Container;
  /** What the line actually drew, for the browser tests to read. */
  report(): string;
  /** Lay the line out for a window this big, in window pixels. */
  layout(windowW: number, windowH: number): void;
  /** Say what this world is doing, with or without the debug labels. */
  update(state: WorldState, debug: boolean): void;
}

export function createHud(): Hud {
  const view = new Container();
  const line = createText(UI_COLOURS.dim);

  view.addChild(line);

  return {
    view,

    report(): string {
      return textReport(line);
    },

    layout(_windowW: number, windowH: number): void {
      const scale = uiScale(windowH);
      const margin = UI_SIZES.margin * scale;

      line.style.fontSize = UI_SIZES.body * scale;
      line.position.set(margin, margin);
    },

    update(state: WorldState, debug: boolean): void {
      line.text = hudLine(state, debug);
    },
  };
}
