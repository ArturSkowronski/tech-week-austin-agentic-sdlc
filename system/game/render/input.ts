// The keyboard, turned into the one thing the simulation understands: an
// InputFrame per tick. The key mapping of
// docs/plan/02-design/movement-and-physics.md lives here and nowhere else.
//
// Buttons are sampled from what is held when the tick runs. The one-shot keys
// are remembered as edges instead, so a press is answered exactly once however
// many frames the key stays down — except for the presses the browser only
// honours inside the event itself, which are called straight through.

import { NO_INPUT, type InputFrame } from '../sim';

/** The presses that act on the game around the simulation, not inside it. */
export interface InputEdges {
  /** Enter, Space or Z: leave the title screen. */
  start: boolean;
  /** R: restart the run. Enter never does. */
  restart: boolean;
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
  F1: 'debug',
};

/**
 * The presses that are answered inside the keydown rather than buffered as an
 * edge: T raises the ticket, which opens a window, and browsers allow that
 * only from the press itself (ADR-006). Buffering it for the frame loop the
 * way `takeEdges` does would turn every raised ticket into a blocked popup.
 */
export interface KeyPress {
  ticket(): void;
}

/** Keys answered in the press, by `KeyboardEvent.code`. */
const PRESSES: Record<string, keyof KeyPress> = {
  KeyT: 'ticket',
};

export interface Keyboard {
  /** What is held right now, for the tick about to run. */
  frame(): InputFrame;
  /** The one-shot keys pressed since the last call; reading clears them. */
  takeEdges(): InputEdges;
}

/** Listen on the window and sample it into frames. */
export function createKeyboard(press: KeyPress): Keyboard {
  const held = new Set<string>();
  const pressed = new Set<keyof InputEdges>();

  function onKeyDown(event: KeyboardEvent): void {
    const oneShot = ONE_SHOTS[event.code];
    const button = BUTTONS[event.code];
    const atOnce = PRESSES[event.code];

    if (!event.repeat) {
      if (oneShot !== undefined) {
        pressed.add(oneShot);
      }

      if (atOnce !== undefined) {
        press[atOnce]();
      }
    }

    // Only buttons are held: R, T and F1 are answered by the press alone, and
    // a set called `held` that carries them would not mean what it says.
    if (button !== undefined) {
      held.add(event.code);
    }

    if (oneShot !== undefined || button !== undefined || atOnce !== undefined) {
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
      const edges: InputEdges = { start: false, restart: false, debug: false };

      for (const edge of pressed) {
        edges[edge] = true;
      }
      pressed.clear();

      return edges;
    },
  };
}
