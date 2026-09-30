// The chrome the ticket card and the completion banner share, drawn in code,
// the pixel font every line of UI text is drawn in, and the banner itself,
// which is that chrome and three lines and nothing else
// (docs/plan/02-design/rendering-and-look.md, UI).
//
// The UI draws over the render texture in the window's own pixels: every piece
// of text here is drawn from the font below at a whole number of window pixels
// to the font pixel, so it stays crisp however large the world's blocks grow
// below it.

import { Container, Graphics } from 'pixi.js';

import { beaconOf, TICK_RATE, type WorldState } from '../sim';
import {
  TEXTURE_H,
  UI_ANCHORS,
  UI_COLOURS,
  UI_GLYPH,
  UI_PANEL_ALPHA,
  UI_SIZES,
} from './config';

/**
 * Window pixels per UI pixel: the largest whole number of them the window's
 * height holds, never below one. Two in a 720 pixel tall window, three in a
 * 1080 pixel one, so the text steps up in whole pixels as the window grows.
 */
export function uiScale(windowHeight: number): number {
  return Math.max(Math.floor(windowHeight / TEXTURE_H), 1);
}

const { w: GLYPH_W, h: GLYPH_H, gap: GLYPH_GAP } = UI_GLYPH;

/** The cell a character the font does not hold takes: blank, but still a cell. */
const BLANK = Array.from({ length: GLYPH_H }, () => '.'.repeat(GLYPH_W));

/**
 * The UI's font, drawn in code: five pixels across and eight down, capitals
 * and digits on the top seven rows, lower case from the third, and the last
 * row left for the tails of `g j p q y`. Each glyph is its eight rows, `#` for
 * an inked pixel, split by slashes so the shape can be seen in the source.
 *
 * Every printable character is here, because the card's lines come out of
 * `bugs/manifest.json` and nothing in this file gets to say what a bug may be
 * called. Anything else — a character the manifest wrote that this font does
 * not hold — is the blank glyph, which still takes its cell.
 *
 * The waterfall's log rain has a font of its own (game/render/waterfall.ts).
 * That one is capitals only at three pixels across, the smallest a falling
 * line can be read at; this one has to carry sentences, so the two are
 * different fonts rather than one fact written twice (AGENTS.md rule 9).
 */
const FONT: Readonly<Record<string, string>> = {
  ' ': '...../...../...../...../...../...../...../.....',
  '!': '..#../..#../..#../..#../..#../...../..#../.....',
  '"': '.#.#./.#.#./.#.#./...../...../...../...../.....',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#./.....',
  $: '..#../.####/#.#../.###./..#.#/####./..#../.....',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##/.....',
  '&': '.##../#..#./#..#./.##../#.#.#/#..#./.##.#/.....',
  "'": '..#../..#../..#../...../...../...../...../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#./.....',
  ')': '.#.../..#../...#./...#./...#./..#../.#.../.....',
  '*': '...../#.#.#/.###./#####/.###./#.#.#/...../.....',
  '+': '...../..#../..#../#####/..#../..#../...../.....',
  ',': '...../...../...../...../...../..##./..#../.#...',
  '-': '...../...../...../#####/...../...../...../.....',
  '.': '...../...../...../...../...../.##../.##../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#..../.....',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###./.....',
  1: '..#../.##../..#../..#../..#../..#../.###./.....',
  2: '.###./#...#/....#/...#./..#../.#.../#####/.....',
  3: '#####/...#./..##./....#/....#/#...#/.###./.....',
  4: '...#./..##./.#.#./#..#./#####/...#./...#./.....',
  5: '#####/#..../####./....#/....#/#...#/.###./.....',
  6: '..##./.#.../#..../####./#...#/#...#/.###./.....',
  7: '#####/....#/...#./..#../.#.../.#.../.#.../.....',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###./.....',
  9: '.###./#...#/#...#/.####/....#/...#./.##../.....',
  ':': '...../.##../.##../...../.##../.##../...../.....',
  ';': '...../.##../.##../...../.##../..#../.#.../.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#./.....',
  '=': '...../...../#####/...../#####/...../...../.....',
  '>': '.#.../..#../...#./....#/...#./..#../.#.../.....',
  '?': '.###./#...#/....#/...#./..#../...../..#../.....',
  '@': '.###./#...#/....#/.##.#/#.#.#/#.#.#/.####/.....',
  A: '..#../.#.#./#...#/#...#/#####/#...#/#...#/.....',
  B: '####./#...#/#...#/####./#...#/#...#/####./.....',
  C: '.###./#...#/#..../#..../#..../#...#/.###./.....',
  D: '###../#..#./#...#/#...#/#...#/#..#./###../.....',
  E: '#####/#..../#..../####./#..../#..../#####/.....',
  F: '#####/#..../#..../####./#..../#..../#..../.....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####/.....',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#/.....',
  I: '.###./..#../..#../..#../..#../..#../.###./.....',
  J: '....#/....#/....#/....#/#...#/#...#/.###./.....',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#/.....',
  L: '#..../#..../#..../#..../#..../#..../#####/.....',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#/.....',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#/.....',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###./.....',
  P: '####./#...#/#...#/####./#..../#..../#..../.....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#/.....',
  R: '####./#...#/#...#/####./#.#../#..#./#...#/.....',
  S: '.####/#..../#..../.###./....#/....#/####./.....',
  T: '#####/..#../..#../..#../..#../..#../..#../.....',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###./.....',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#../.....',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#/.....',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#/.....',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#../.....',
  Z: '#####/....#/...#./..#../.#.../#..../#####/.....',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###./.....',
  '\\': '#..../#..../.#.../..#../...#./....#/....#/.....',
  ']': '.###./...#./...#./...#./...#./...#./.###./.....',
  '^': '..#../.#.#./#...#/...../...../...../...../.....',
  _: '...../...../...../...../...../...../...../#####',
  '`': '.#.../..#../...#./...../...../...../...../.....',
  a: '...../...../.###./....#/.####/#...#/.####/.....',
  b: '#..../#..../#.##./##..#/#...#/#...#/####./.....',
  c: '...../...../.###./#..../#..../#...#/.###./.....',
  d: '....#/....#/.##.#/#..##/#...#/#...#/.####/.....',
  e: '...../...../.###./#...#/#####/#..../.###./.....',
  f: '..##./.#..#/.#.../####./.#.../.#.../.#.../.....',
  g: '...../...../.####/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../#.##./##..#/#...#/#...#/#...#/.....',
  i: '..#../...../.##../..#../..#../..#../.###./.....',
  j: '...#./...../..##./...#./...#./#..#./#..#./.##..',
  k: '#..../#..../#..#./#.#../##.../#.#../#..#./.....',
  l: '.##../..#../..#../..#../..#../..#../.###./.....',
  m: '...../...../##.#./#.#.#/#.#.#/#...#/#...#/.....',
  n: '...../...../#.##./##..#/#...#/#...#/#...#/.....',
  o: '...../...../.###./#...#/#...#/#...#/.###./.....',
  p: '...../...../####./#...#/#...#/####./#..../#....',
  q: '...../...../.####/#...#/#...#/.####/....#/....#',
  r: '...../...../#.##./##..#/#..../#..../#..../.....',
  s: '...../...../.####/#..../.###./....#/####./.....',
  t: '.#.../.#.../####./.#.../.#.../.#..#/..##./.....',
  u: '...../...../#...#/#...#/#...#/#..##/.##.#/.....',
  v: '...../...../#...#/#...#/#...#/.#.#./..#../.....',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#./.....',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#/.....',
  y: '...../...../#...#/#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/...#./..#../.#.../#####/.....',
  '{': '...#./..#../..#../.#.../..#../..#../...#./.....',
  '|': '..#../..#../..#../..#../..#../..#../..#../.....',
  '}': '.#.../..#../..#../...#./..#../..#../.#.../.....',
  '~': '...../...../.#..#/#.#.#/#..#./...../...../.....',
};

/** The font's rows, split once: a redraw reads them a character at a time. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(FONT).map(([char, glyph]) => [char, glyph.split('/')]),
);

/** The rows of a character, `GLYPH_H` of them and `GLYPH_W` pixels each. */
export function glyphOf(char: string): readonly string[] {
  return GLYPHS[char] ?? BLANK;
}

/**
 * The leaf the chrome's border is made of, drawn on the same pixel grid as the
 * font and symmetric both ways, so the one shape serves all four edges without
 * being turned round (art-direction.md, forest greens and aged gold).
 */
const LEAF = ['..#..', '.###.', '#####', '.###.', '..#..'];

/** Paint a pixel grid into a Graphics, one rectangle per inked pixel. */
function drawPixels(
  ink: Graphics,
  rows: readonly string[],
  x: number,
  y: number,
  pixel: number,
): void {
  rows.forEach((row, down) => {
    for (let across = 0; across < row.length; across += 1) {
      if (row[across] === '#') {
        ink.rect(x + across * pixel, y + down * pixel, pixel, pixel);
      }
    }
  });
}

/** How wide a run of this many characters comes out, in window pixels. */
function runWidth(chars: number, advance: number, pixel: number): number {
  return chars === 0 ? 0 : (chars - 1) * advance + GLYPH_W * pixel;
}

/**
 * Greedy lines of at most `room` characters, broken between words and at the
 * newlines already in the text. A word longer than a line stands on its own
 * and overflows rather than being cut in half.
 */
function wrap(text: string, room: number): string[] {
  const paragraphs = text.split('\n');

  if (room === Number.POSITIVE_INFINITY) {
    return paragraphs;
  }

  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    let line = '';

    for (const word of paragraph.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`;

      if (line === '' || [...next].length <= room) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }

    lines.push(line);
  }

  return lines;
}

/** The look of a line of UI text. Sizes are in window pixels. */
export interface PixelStyle {
  /** How tall a character cell is asked to be; the font snaps it to whole pixels. */
  fontSize: number;
  /** Extra space between one character and the next. */
  letterSpacing: number;
  /** The width the lines wrap inside, or zero to let them run on. */
  wrapWidth: number;
}

/** How wide and tall a piece of text came out, in window pixels. */
export interface TextSize {
  w: number;
  h: number;
}

/**
 * A piece of UI text drawn from the font above. Set `text` and `style`, then
 * ask {@link PixelText.measure} for the box it fills; a redraw only happens
 * when one of them actually changed, so the HUD's line costs nothing on the
 * frames it reads the same.
 */
export class PixelText extends Graphics {
  text = '';

  readonly style: PixelStyle = { fontSize: UI_SIZES.body, letterSpacing: 0, wrapWidth: 0 };

  private readonly colour: number;
  /** What the last draw was made from; the zero size makes the first one happen. */
  private drawn: PixelStyle & { text: string } = {
    text: '',
    fontSize: 0,
    letterSpacing: 0,
    wrapWidth: 0,
  };

  private size: TextSize = { w: 0, h: 0 };
  private cell = 0;

  constructor(colour: number) {
    super();
    this.colour = colour;
    // game/render/hud.ts sets its line and never asks how wide it came out, so
    // the redraw has to happen on the frame as well as on a measurement.
    this.onRender = (): void => {
      this.measure();
    };
  }

  /** The box the text fills, drawing it again first if anything changed. */
  measure(): TextSize {
    const { fontSize, letterSpacing, wrapWidth } = this.style;
    const { drawn } = this;

    if (
      drawn.text !== this.text ||
      drawn.fontSize !== fontSize ||
      drawn.letterSpacing !== letterSpacing ||
      drawn.wrapWidth !== wrapWidth
    ) {
      this.drawn = { text: this.text, fontSize, letterSpacing, wrapWidth };
      this.size = this.draw();
    }

    return this.size;
  }

  /** How tall a character came out, which is what the crispness is judged on. */
  cellHeight(): number {
    this.measure();

    return this.cell;
  }

  private draw(): TextSize {
    const { fontSize, letterSpacing, wrapWidth } = this.style;
    // Whole window pixels to the font pixel, never none: that is what keeps
    // the glyphs square at every window size the view is shown at.
    const pixel = Math.max(Math.round(fontSize / GLYPH_H), 1);
    const advance = (GLYPH_W + GLYPH_GAP) * pixel + letterSpacing;
    const lineHeight = (GLYPH_H + GLYPH_GAP) * pixel;
    const room =
      wrapWidth > 0
        ? Math.max(Math.floor((wrapWidth - GLYPH_W * pixel) / advance) + 1, 1)
        : Number.POSITIVE_INFINITY;
    // Code points, not UTF-16 units: card lines come from bugs/manifest.json,
    // so one astral character must not be measured as two cells and pull the
    // line off the centre of a panel sized for the wrong width.
    const lines = wrap(this.text, room).map((line) => [...line]);
    const width = Math.max(...lines.map((chars) => runWidth(chars.length, advance, pixel)));

    this.clear();

    lines.forEach((chars, row) => {
      const left = Math.round((width - runWidth(chars.length, advance, pixel)) / 2);

      chars.forEach((char, index) => {
        drawPixels(this, glyphOf(char), left + index * advance, row * lineHeight, pixel);
      });
    });

    this.fill(this.colour);
    this.cell = pixel * GLYPH_H;

    return { w: width, h: lines.length * lineHeight - GLYPH_GAP * pixel };
  }
}

/** A piece of UI text. Its size is set when the window's size is known. */
export function createText(colour: number = UI_COLOURS.ink): PixelText {
  return new PixelText(colour);
}

/**
 * What a text object actually drew, measured off itself so a browser test
 * reads the result and not the rule, the way game/render/scene.ts publishes
 * the fit. Crisp is this: a character cell that came out the whole size the
 * window asked for, drawn at scale one instead of blown up from the world's
 * pixels.
 */
export function textReport(text: PixelText): string {
  return `${text.cellHeight()}px scale ${text.worldTransform.a}`;
}

/**
 * Evenly spaced origins for a motif `size` wide stepping across a span this
 * wide. The origin is rounded, not the centre: an odd `size` would otherwise
 * put the motif's pixels on half a window pixel, and art-direction.md asks for
 * square pixels on a uniform grid rather than ones the rasteriser happens to
 * resolve our way.
 */
export function motifOrigins(span: number, step: number, size: number): number[] {
  const count = Math.max(Math.floor(span / step), 1);
  const first = (span - (count - 1) * step) / 2;

  return Array.from({ length: count }, (_, index) =>
    Math.round(first + index * step - size / 2),
  );
}

/**
 * The one chrome the ticket card and the completion banner wear: charcoal
 * behind a gold edge, with leaves marching around the inside of it. Both
 * panels come through here, so neither can drift away from the other.
 */
function drawChrome(chrome: Graphics, w: number, h: number, scale: number): void {
  const border = UI_SIZES.border * scale;
  const leaf = LEAF.length * scale;
  const inset = border + scale;
  const step = UI_SIZES.leafStep * scale;

  chrome
    .clear()
    .roundRect(0, 0, w, h, UI_SIZES.radius * scale)
    .fill({ color: UI_COLOURS.chrome, alpha: UI_PANEL_ALPHA })
    .stroke({ width: border, color: UI_COLOURS.edge });

  for (const x of motifOrigins(w, step, leaf)) {
    drawPixels(chrome, LEAF, x, inset, scale);
    drawPixels(chrome, LEAF, x, h - inset - leaf, scale);
  }

  for (const y of motifOrigins(h, step, leaf)) {
    drawPixels(chrome, LEAF, inset, y, scale);
    drawPixels(chrome, LEAF, w - inset - leaf, y, scale);
  }

  chrome.fill(UI_COLOURS.edge);
}

/** A box of lines in the shared chrome, centred across the window. */
export interface Panel {
  readonly view: Container;
  /** What the panel's lines actually drew, for the browser tests to read. */
  report(): string;
  /** The words on it and whether a button is under them, read off both. */
  says(): string;
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
    // Never wider than the window, however tall and narrow that window is.
    label.style.wrapWidth = Math.min(UI_SIZES.maxWidth * scale, windowW) - padding * 2;
    label.text = lines.join('\n');

    const text = label.measure();

    button?.resize(windowH);

    const pressable = button?.view ?? null;
    const innerW = Math.max(text.w, pressable?.width ?? 0);
    const innerH = text.h + (pressable === null ? 0 : UI_SIZES.gap * scale + pressable.height);
    const w = Math.round(innerW + padding * 2);
    const h = Math.round(innerH + padding * 2);

    drawChrome(chrome, w, h, scale);

    label.position.set(Math.round((w - text.w) / 2), padding);
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

    says(): string {
      return `${button === null ? 'no button' : 'button'}: ${label.text}`;
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

      const size = text.measure();
      const w = Math.round(size.w + padding * 2);
      const h = Math.round(size.h + padding * 2);

      box.clear().roundRect(0, 0, w, h, UI_SIZES.radius * scale).fill(UI_COLOURS.ink);
      text.position.set(Math.round((w - size.w) / 2), Math.round((h - size.h) / 2));
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

/** The completion banner, up from the tick the beacon lights. */
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
      // The beacon itself, not the touch that started the cast: the wizard
      // spins, gathers and fires first, and the banner waits for the beam to
      // land (docs/plan/02-design/level-design.md, the beacon ends the run).
      const lit = beaconOf(state)?.active === true;

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
