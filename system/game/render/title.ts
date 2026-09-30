// The title screen: the textless splash the asset kit builds, fitted the way
// the world's view is, with the name drawn in code over it and the one rule
// about leaving it (docs/plan/02-design/rendering-and-look.md, UI).

import { Container, Graphics, Sprite } from 'pixi.js';

import { UI_ANCHORS, UI_COLOURS, UI_SIZES, UI_TITLE_BAND, viewBox } from './config';
import type { InputEdges } from './input';
import { createText, textReport, uiScale } from './panel';
import { loadArt, loadManifest } from './sprites';

/**
 * The name, drawn in code: the splash art carries no text of its own, and the
 * letters come out of the pixel font in game/render/panel.ts, so the wordmark
 * is the same gold as the card and the banner below it.
 */
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

/** The splash is loaded here, so the title screen is awaited like the art is. */
export async function createTitle(): Promise<Title> {
  const art = await loadArt(await loadManifest(), 'splash');
  const view = new Container();
  const splash = new Sprite(art.texture);
  const bands = new Graphics();
  const wordmark = createText();
  const tagline = createText(UI_COLOURS.dim);
  const prompt = createText(UI_COLOURS.dim);

  wordmark.text = WORDMARK;
  tagline.text = TAGLINE;
  prompt.text = PROMPT;

  view.addChild(splash, bands, wordmark, tagline, prompt);

  return {
    view,

    report(): string {
      return textReport(wordmark);
    },

    layout(windowW: number, windowH: number): void {
      const scale = uiScale(windowH);
      const box = viewBox(windowW, windowH);

      // The splash is one frame of the whole view, so it is shown in the box
      // config.ts fits the world into.
      splash.scale.set(box.scale / art.density);
      splash.position.set(box.x, box.y);

      wordmark.style.fontSize = UI_SIZES.wordmark * scale;
      wordmark.style.letterSpacing = UI_SIZES.wordmarkSpacing * scale;
      tagline.style.fontSize = UI_SIZES.body * scale;
      prompt.style.fontSize = UI_SIZES.body * scale;

      const pad = UI_TITLE_BAND.pad * scale;

      bands.clear();

      for (const [line, share] of [
        [wordmark, UI_ANCHORS.wordmark],
        [tagline, UI_ANCHORS.tagline],
        [prompt, UI_ANCHORS.prompt],
      ] as const) {
        const size = line.measure();

        line.position.set(
          Math.round((windowW - size.w) / 2),
          Math.round(windowH * share - size.h / 2),
        );
        bands
          .roundRect(
            line.x - pad,
            line.y - pad,
            size.w + 2 * pad,
            size.h + 2 * pad,
            UI_SIZES.radius * scale,
          )
          .fill({ color: UI_COLOURS.chrome, alpha: UI_TITLE_BAND.alpha });
      }

      const mark = wordmark.measure();

      // The rule the wordmark stands on, a panel's own margin below it so the
      // title reads as the same family as the card and the banner.
      bands
        .rect(
          wordmark.x,
          Math.round(wordmark.y + mark.h + UI_SIZES.gap * scale),
          mark.w,
          UI_SIZES.border * scale,
        )
        .fill(UI_COLOURS.edge);
    },
  };
}
