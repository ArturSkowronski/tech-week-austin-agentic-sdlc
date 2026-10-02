// What the visitor is allowed to decide, which so far is the music
// (docs/plan/02-design/rendering-and-look.md, UI; the atmosphere and audio
// brief). The answer is remembered between visits, and it starts at off: a
// page that began playing a theme at a visitor who came to read the code would
// be answering a question nobody asked.
//
// The toggle is pressed rather than typed, and that is deliberate. A sound may
// only start after a gesture, so the press that asks for the music is itself
// the gesture that allows it, and there is no state in which the toggle says
// on and the page stays silent.

import { Container } from 'pixi.js';

import { UI_SIZES } from './config';
import { createButton, uiScale } from './panel';

/** Where the answer is kept, under the one key this game writes. */
export const MUSIC_KEY = 'hobby-wizard.music';

/** What a kept answer looks like; anything else, and none at all, is off. */
const ON = 'on';

/** What the toggle says of itself, which is the state it is in. */
function label(on: boolean): string {
  return on ? 'Music on' : 'Music off';
}

/** As much of `localStorage` as the toggle uses; a test hands it its own. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What this store remembers about the music. An unvisited store says off. */
export function musicKept(store: Store): boolean {
  return store.getItem(MUSIC_KEY) === ON;
}

/** Remember the answer for the next visit. */
export function keepMusic(store: Store, on: boolean): void {
  store.setItem(MUSIC_KEY, on ? ON : 'off');
}

export interface Settings {
  readonly view: Container;
  /** Is the music wanted right now? */
  music(): boolean;
  /** What the toggle says, for the browser tests to read. */
  report(): string;
  /** Place the toggle for a window this big, in window pixels. */
  layout(windowW: number, windowH: number): void;
}

/**
 * The toggle: the UI's own pressable label (game/render/panel.ts), kept in the
 * corner the HUD's line leaves free. `onChange` is called from the press
 * itself, so whatever starts the music starts it inside the gesture the
 * browser is counting.
 */
export function createSettings(onChange: (on: boolean) => void, store: Store): Settings {
  let on = musicKept(store);
  let windowW = 0;
  let windowH = 0;

  const button = createButton(label(on), () => {
    on = !on;
    keepMusic(store, on);
    button.says = label(on);
    place(windowW, windowH);
    onChange(on);
  });

  /** Draw the toggle and stand it in the top right corner of the window. */
  function place(width: number, height: number): void {
    windowW = width;
    windowH = height;
    button.resize(height);

    const margin = UI_SIZES.margin * uiScale(height);

    // Whole pixels, so the glyphs land on the window's grid and stay sharp.
    button.view.position.set(Math.round(width - margin - button.view.width), Math.round(margin));
  }

  return {
    view: button.view,
    music: () => on,
    report: () => button.says,
    layout: place,
  };
}
