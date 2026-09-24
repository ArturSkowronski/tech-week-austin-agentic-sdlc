// The chrome the ticket card and the completion banner share, drawn in code,
// and the banner itself, which is that chrome and three lines and nothing else
// (docs/plan/02-design/rendering-and-look.md, UI).
//
// The UI draws over the render texture in the window's own pixels: every piece
// of text here is rasterised at the size it is shown at and drawn unscaled, so
// it stays crisp however large the world's blocks grow below it.

import { Container, Graphics, Text } from 'pixi.js';

import { TICK_RATE, type WorldState } from '../sim';
import { TEXTURE_H, UI_ANCHORS, UI_COLOURS, UI_FONT, UI_PANEL_ALPHA, UI_SIZES } from './config';

/**
 * Window pixels per UI pixel: the largest whole number of them the window's
 * height holds, never below one. Two in a 720 pixel tall window, three in a
 * 1080 pixel one, so the text steps up in whole pixels as the window grows.
 */
export function uiScale(windowHeight: number): number {
  return Math.max(Math.floor(windowHeight / TEXTURE_H), 1);
}

/** A piece of UI text. Its size is set when the window's size is known. */
export function createText(colour: number = UI_COLOURS.ink): Text {
  return new Text({
    text: '',
    style: { fontFamily: UI_FONT, fontSize: UI_SIZES.body, fill: colour, align: 'center' },
  });
}

/**
 * What a text object actually drew, measured off itself so a browser test
 * reads the result and not the rule, the way game/render/scene.ts publishes
 * the fit. Crisp is this: glyphs rasterised at the size the window asks for,
 * and drawn at scale one instead of blown up from the world's pixels.
 */
export function textReport(text: Text): string {
  return `${text.style.fontSize}px scale ${text.worldTransform.a}`;
}

/** A box of lines in the shared chrome, centred across the window. */
export interface Panel {
  readonly view: Container;
  /** What the panel's lines actually drew, for the browser tests to read. */
  report(): string;
  /** The lines to show, top to bottom. */
  set(lines: readonly string[]): void;
  /** The button below the lines, or none; it lands at the next `set`. */
  setButton(next: Button | null): void;
  /** Size and place the panel for a window this big, in window pixels. */
  layout(windowW: number, windowH: number): void;
}

/** `anchorY` is the share of the window's height the panel's middle sits at. */
export function createPanel(anchorY: number): Panel {
  const view = new Container();
  const chrome = new Graphics();
  const label = createText();

  let button: Button | null = null;
  let lines: readonly string[] = [];
  let windowW = 0;
  let windowH = 0;

  view.addChild(chrome, label);

  function draw(): void {
    const scale = uiScale(windowH);
    const padding = UI_SIZES.padding * scale;

    label.style.fontSize = UI_SIZES.body * scale;
    label.style.wordWrap = true;
    // Never wider than the window, however tall and narrow that window is.
    label.style.wordWrapWidth = Math.min(UI_SIZES.maxWidth * scale, windowW) - padding * 2;
    label.text = lines.join('\n');

    button?.resize(windowH);

    const pressable = button?.view ?? null;
    const innerW = Math.max(label.width, pressable?.width ?? 0);
    const innerH =
      label.height + (pressable === null ? 0 : UI_SIZES.gap * scale + pressable.height);
    const w = Math.round(innerW + padding * 2);
    const h = Math.round(innerH + padding * 2);

    chrome
      .clear()
      .roundRect(0, 0, w, h, UI_SIZES.radius * scale)
      .fill({ color: UI_COLOURS.chrome, alpha: UI_PANEL_ALPHA })
      .stroke({ width: UI_SIZES.border * scale, color: UI_COLOURS.edge });

    label.position.set(Math.round((w - label.width) / 2), padding);
    pressable?.position.set(
      Math.round((w - pressable.width) / 2),
      Math.round(h - padding - pressable.height),
    );
    // Whole pixels, so the glyphs land on the window's grid and stay sharp.
    view.position.set(Math.round((windowW - w) / 2), Math.round(windowH * anchorY - h / 2));
  }

  return {
    view,

    report(): string {
      return textReport(label);
    },

    set(next: readonly string[]): void {
      lines = next;
      draw();
    },

    setButton(next: Button | null): void {
      if (button !== null) {
        view.removeChild(button.view);
      }

      button = next;

      if (next !== null) {
        view.addChild(next.view);
      }
    },

    layout(width: number, height: number): void {
      windowW = width;
      windowH = height;
      draw();
    },
  };
}

/** A pressable label in the same chrome, gold behind charcoal letters. */
export interface Button {
  readonly view: Container;
  /** Draw it for a window this tall; its label decides how wide it is. */
  resize(windowH: number): void;
}

export function createButton(label: string, onPress: () => void): Button {
  const view = new Container();
  const box = new Graphics();
  const text = createText(UI_COLOURS.chrome);

  view.addChild(box, text);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  // On the press itself, never after it: a window opened later is a popup the
  // browser blocks (ADR-006).
  view.on('pointerdown', onPress);

  return {
    view,

    resize(windowH: number): void {
      const scale = uiScale(windowH);
      const padding = UI_SIZES.padding * scale;

      text.style.fontSize = UI_SIZES.body * scale;
      text.text = label;

      const w = Math.round(text.width + padding * 2);
      const h = Math.round(text.height + padding);

      box.clear().roundRect(0, 0, w, h, UI_SIZES.radius * scale).fill(UI_COLOURS.ink);
      text.position.set(Math.round((w - text.width) / 2), Math.round((h - text.height) / 2));
    },
  };
}

/**
 * A run's length, from ticks to `m:ss.s`. Rounded once, to tenths, and split
 * only after: taking the minutes off the raw seconds and rounding the seconds
 * apart from them lets the two disagree at the boundary, and 0:60.0 is not a
 * time a run can end at.
 */
function clock(ticks: number): string {
  const tenths = Math.round((Math.max(ticks, 0) / TICK_RATE) * 10);
  const minutes = Math.floor(tenths / 600);

  return `${minutes}:${((tenths - minutes * 600) / 10).toFixed(1).padStart(4, '0')}`;
}

/** What the banner says at the beacon: the run's time, and what it cost. */
export function bannerLines(state: WorldState): readonly string[] {
  return ['The beacon is lit', `Time ${clock(state.victoryTick)}`, `Deaths ${state.deaths}`];
}

/** The completion banner, up from the tick the beacon is reached. */
export interface Banner {
  readonly view: Container;
  layout(windowW: number, windowH: number): void;
  /** Show or hide the banner for this world. */
  update(state: WorldState): void;
}

export function createBanner(): Banner {
  const panel = createPanel(UI_ANCHORS.banner);

  panel.view.visible = false;

  return {
    view: panel.view,

    layout(windowW: number, windowH: number): void {
      panel.layout(windowW, windowH);
    },

    update(state: WorldState): void {
      const lit = state.victoryTick >= 0;

      // Only on the tick it changes: the run is over, and redrawing the same
      // three lines every frame would be work for nothing.
      if (lit !== panel.view.visible) {
        panel.view.visible = lit;

        if (lit) {
          panel.set(bannerLines(state));
        }
      }
    },
  };
}
