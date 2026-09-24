// The keyboard, turned into the one thing the simulation understands: an
// InputFrame per tick. The key mapping of
// docs/plan/02-design/movement-and-physics.md lives here and nowhere else.
//
// Buttons are sampled from what is held when the tick runs. The four one-shot
// keys are remembered as edges instead, so a press is answered exactly once
// however many frames the key stays down.

import { NO_INPUT, type InputFrame } from '../sim';

/** The presses that act on the game around the simulation, not inside it. */
export interface InputEdges {
  /** Enter, Space or Z: leave the title screen. */
  start: boolean;
  /** R: restart the run. Enter never does. */
  restart: boolean;
  /** T: raise the ticket card. */
  ticket: boolean;
  /** F1: hitboxes and tiles over a painting. */
  debug: boolean;
}

/** Held keys, by `KeyboardEvent.code`. */
const BUTTONS: Record<string, keyof InputFrame> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  KeyZ: 'jump',
  Space: 'jump',
  KeyX: 'charge',
  KeyJ: 'charge',
  ArrowDown: 'down',
  KeyS: 'down',
};

/** One-shot keys, by `KeyboardEvent.code`. */
const ONE_SHOTS: Record<string, keyof InputEdges> = {
  Enter: 'start',
  Space: 'start',
  KeyZ: 'start',
  KeyR: 'restart',
  KeyT: 'ticket',
  F1: 'debug',
};

export interface Keyboard {
  /** What is held right now, for the tick about to run. */
  frame(): InputFrame;
  /** The one-shot keys pressed since the last call; reading clears them. */
  takeEdges(): InputEdges;
}

/** Listen on the window and sample it into frames. */
export function createKeyboard(): Keyboard {
  const held = new Set<string>();
  const pressed = new Set<keyof InputEdges>();

  function onKeyDown(event: KeyboardEvent): void {
    const oneShot = ONE_SHOTS[event.code];
    const button = BUTTONS[event.code];

    if (oneShot !== undefined && !event.repeat) {
      pressed.add(oneShot);
    }

    // Only buttons are held: R, T and F1 are answered by their edge alone, and
    // a set called `held` that carries them would not mean what it says.
    if (button !== undefined) {
      held.add(event.code);
    }

    if (oneShot !== undefined || button !== undefined) {
      // Arrows and Space would otherwise scroll the page under the game.
      event.preventDefault();
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    held.delete(event.code);
  }

  // A window that loses focus never sees the key come up again.
  function onBlur(): void {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    frame(): InputFrame {
      const frame = { ...NO_INPUT };

      for (const code of held) {
        const button = BUTTONS[code];

        if (button !== undefined) {
          frame[button] = true;
        }
      }

      return frame;
    },

    takeEdges(): InputEdges {
      const edges: InputEdges = { start: false, restart: false, ticket: false, debug: false };

      for (const edge of pressed) {
        edges[edge] = true;
      }
      pressed.clear();

      return edges;
    },
  };
}
