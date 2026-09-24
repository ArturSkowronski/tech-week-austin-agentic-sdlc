// The title screen: a wordmark drawn in code over the splash, and the one rule
// about leaving it (docs/plan/02-design/rendering-and-look.md, UI).

import { Container, Graphics } from 'pixi.js';

import { UI_ANCHORS, UI_COLOURS, UI_PANEL_ALPHA, UI_SIZES } from './config';
import type { InputEdges } from './input';
import { createText, textReport, uiScale } from './panel';

/** The name, drawn in code: the splash art carries no text of its own. */
const WORDMARK = 'HOBBY WIZARD';
const TAGLINE = 'and the Hidden Bug';
const PROMPT = 'Enter, Space or Z to start';

/**
 * Does this frame's presses leave the title screen? Enter, Space and Z do, and
 * only while the title is up: once a run is going Enter is nothing at all, and
 * starting it over belongs to R alone (game/render/input.ts).
 */
export function startsRun(edges: InputEdges, started: boolean): boolean {
  return edges.start && !started;
}

export interface Title {
  readonly view: Container;
  /** What the wordmark actually drew, for the browser tests to read. */
  report(): string;
  /** Lay the title out for a window this big, in window pixels. */
  layout(windowW: number, windowH: number): void;
}

export function createTitle(): Title {
  const view = new Container();
  const backdrop = new Graphics();
  const wordmark = createText();
  const tagline = createText(UI_COLOURS.dim);
  const prompt = createText(UI_COLOURS.dim);

  wordmark.text = WORDMARK;
  tagline.text = TAGLINE;
  prompt.text = PROMPT;

  view.addChild(backdrop, wordmark, tagline, prompt);

  return {
    view,

    report(): string {
      return textReport(wordmark);
    },

    layout(windowW: number, windowH: number): void {
      const scale = uiScale(windowH);

      wordmark.style.fontSize = UI_SIZES.wordmark * scale;
      wordmark.style.letterSpacing = UI_SIZES.wordmarkSpacing * scale;
      tagline.style.fontSize = UI_SIZES.body * scale;
      prompt.style.fontSize = UI_SIZES.body * scale;

      for (const [line, share] of [
        [wordmark, UI_ANCHORS.wordmark],
        [tagline, UI_ANCHORS.tagline],
        [prompt, UI_ANCHORS.prompt],
      ] as const) {
        line.position.set(
          Math.round((windowW - line.width) / 2),
          Math.round(windowH * share - line.height / 2),
        );
      }

      // Charcoal over the whole window, and the rule the wordmark stands on.
      backdrop
        .clear()
        .rect(0, 0, windowW, windowH)
        .fill({ color: UI_COLOURS.chrome, alpha: UI_PANEL_ALPHA })
        .rect(
          wordmark.x,
          Math.round(wordmark.y + wordmark.height + UI_SIZES.border * scale),
          wordmark.width,
          UI_SIZES.border * scale,
        )
        .fill(UI_COLOURS.edge);
    },
  };
}
