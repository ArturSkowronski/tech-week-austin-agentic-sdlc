// The ticket card: what the game is willing to say about the planted bug, and
// the way out to a prefilled issue (docs/plan/02-design/bug-quest.md, ADR-006).
//
// The card knows the four faces and when each is shown. Where the bug comes
// from is the manifest reader's (HWP-050) and what the button opens is the
// issue builder's (HWP-053); both reach the card as the facts and the callback
// below, so this file never names a module path the player must not see.

import type { Container } from 'pixi.js';

import type { PropKind } from '../sim';
import { TICKET_DISMISS_TICKS, UI_ANCHORS } from './config';
import { createButton, createPanel } from './panel';

/** The label of the button and of the T key (ADR-006). */
const RAISE_LABEL = 'Raise ticket on GitHub';

/** The manifest's bug, as the card needs it. Never the defect's file. */
export interface CardBug {
  id: string;
  title: string;
  /** A module-level hint, never a file. */
  clue: string;
  /** The prop its creature hides in; the legend's kinds are in game/sim/room.ts. */
  hides: PropKind;
}

/** What the player knows when the card comes up. */
export interface CardFacts {
  /** The room's planted bug, or null when the manifest holds none for it. */
  bug: CardBug | null;
  /** Has the creature ridden along yet: the creature's `firstCarried`. */
  felt: boolean;
  /** Has the room's waterfall been parted and its log lines read? */
  logsRead: boolean;
}

/** One of the card's four faces. */
export interface CardFace {
  text: string;
  /** Only the face that names the bug offers the way out (ADR-006). */
  button: boolean;
}

/**
 * The face for what the player knows, or null while he knows neither half of
 * it — a bug he has not felt and logs he has not read leave the card nothing
 * to say (the four states of bug-quest.md).
 */
export function cardFace(facts: CardFacts): CardFace | null {
  const { bug, felt, logsRead } = facts;

  if (bug === null) {
    return { text: 'The logs are clean.', button: false };
  }

  if (felt && logsRead) {
    return { text: `The logs name your bug: ${bug.id} ${bug.title}. Raise a ticket.`, button: true };
  }

  if (felt) {
    return { text: `Something is wrong with ${bug.clue}.`, button: false };
  }

  if (logsRead) {
    return {
      text: `The logs mention a bug in ${bug.clue}. It hides in the ${bug.hides}.`,
      button: false,
    };
  }

  return null;
}

/**
 * Can a card that has been up for this many ticks be waved away? Three seconds
 * of it are the player's whatever he presses, so the words are read before a
 * jump takes them off the screen.
 */
export function canDismiss(shownFor: number): boolean {
  return shownFor >= TICKET_DISMISS_TICKS;
}

export interface TicketCard {
  readonly view: Container;
  /** What the card's text actually drew, for the browser tests to read. */
  report(): string;
  /** The T key: put the card up, or raise the ticket when it offers that. */
  press(facts: CardFacts, tick: number): void;
  /** Wave the card away. Ignored until it has been up for three seconds. */
  dismiss(tick: number): void;
  /** Take the card down whatever it shows; a restarted run has none. */
  hide(): void;
  /** Lay the card out for a window this big, in window pixels. */
  layout(windowW: number, windowH: number): void;
}

/** `onRaise` opens the prefilled issue, and is called inside the press. */
export function createTicketCard(onRaise: () => void): TicketCard {
  const panel = createPanel(UI_ANCHORS.card);
  const button = createButton(RAISE_LABEL, onRaise);

  let face: CardFace | null = null;
  let shownAt = 0;

  panel.view.visible = false;

  function hide(): void {
    panel.view.visible = false;
    face = null;
  }

  function show(facts: CardFacts, tick: number): void {
    const next = cardFace(facts);

    if (next === null) {
      return;
    }

    face = next;
    shownAt = tick;

    panel.setButton(next.button ? button : null);
    panel.set([next.text]);
    panel.view.visible = true;
  }

  return {
    view: panel.view,
    hide,

    report(): string {
      return panel.report();
    },

    press(facts: CardFacts, tick: number): void {
      if (face === null) {
        show(facts, tick);
      } else if (face.button) {
        onRaise();
      }
    },

    dismiss(tick: number): void {
      if (face !== null && canDismiss(tick - shownAt)) {
        hide();
      }
    },

    layout(windowW: number, windowH: number): void {
      panel.layout(windowW, windowH);
    },
  };
}
