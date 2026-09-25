// The trace tool (ADR-004, docs/plan/02-design/level-design.md, painting a
// room): the page at /tools/trace/index.html on the dev server, where a room's
// painting is traced into the text map the game collides with.
//
// The work is the painting drawn 1:1 under a grid of the room's characters.
// Auto-trace lays down a first pass of solid tiles from the art's own opacity,
// the legend brushes fix the edges and place the props, undo walks back
// through the maps the model returned, and save posts the room module to the
// dev server, which writes it into game/content/rooms/ — where the rooms glob
// finds it with no list to edit (AGENTS.md rule 2) and `?room=<name>` plays it.
//
// Everything about a map lives in ./map.ts; what is left here is the drawing,
// the pointer, and the two posts.

import { RENDER_DENSITY } from '../../game/render/config';
import { parseRoom } from '../../game/sim';

import {
  autoTrace,
  blank,
  BRUSHES,
  EMPTY,
  fill,
  parse,
  resize,
  serialise,
  set,
  TILE_PX,
  widthOf,
  type Opacity,
  type TileBox,
  type TraceMap,
} from './map';

/**
 * The room modules as they are written. game/content/rooms/index.ts globs the
 * same directory for what the game plays; the tool reads the source instead,
 * because a save has to give the module its own header comment back.
 */
const sources = import.meta.glob<string>('/game/content/rooms/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Every room's source by name; the glob's own index module is not a room. */
const roomSources = new Map(
  Object.entries(sources)
    .map(([path, source]): [string, string] => [path.replace(/^.*\/|\.ts$/g, ''), source])
    .filter(([name]) => name !== 'index'),
);

/** Maps kept for undo. A trace is many small strokes, so the stack is deep. */
const UNDO = 200;

/** A tile of the grid, as the pointer lands on it. */
interface Cell {
  x: number;
  y: number;
}

/** The drawing surface of a canvas, which the tool cannot work without. */
function context(surface: HTMLCanvasElement): CanvasRenderingContext2D {
  const found = surface.getContext('2d');

  if (found === null) {
    throw new Error('the trace tool needs a 2d canvas');
  }

  return found;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.querySelector<T>(`#${id}`);

  if (found === null) {
    throw new Error(`index.html has no #${id}`);
  }

  return found;
}

const roomPicker = element<HTMLSelectElement>('room');
const widthInput = element<HTMLInputElement>('width');
const heightInput = element<HTMLInputElement>('height');
const brushBar = element('brushes');
const canvas = element<HTMLCanvasElement>('grid');
const status = element('status');
const ink = context(canvas);

/**
 * The room the page is open on, kept in its own URL. A save writes into
 * game/content/rooms/, which the `?raw` glob above is a module dependency of,
 * so the dev server full-reloads this page the moment the file lands; without
 * the hash the tool would come back on the first room of the picker and read
 * as having forgotten what was being traced.
 */
function opened(): string | null {
  const wanted = decodeURIComponent(window.location.hash.slice(1));

  return wanted === '' ? null : wanted;
}

let name = opened() ?? roomSources.keys().next().value ?? 'forest-glade';
let map: TraceMap = { header: '', rows: [] };
let painting: HTMLImageElement | null = null;
let brush = '#';
let hover: Cell | null = null;
/** Where the last stroke went down; a shift-click fills the box back to it. */
let anchor: Cell | null = null;
let past: TraceMap[] = [];
let message = '';

/** Keep the map as it stands, so the next edit can be walked back. */
function remember(): void {
  past.push(map);

  if (past.length > UNDO) {
    past.shift();
  }
}

/** The colour a legend character is flagged in. */
function colourOf(char: string): string {
  return BRUSHES.find((entry) => entry.char === char)?.colour ?? '#ffffff';
}

/**
 * Outline what the brush would cover if it went down on this tile. The
 * simulation parses a probe map to say how much room a prop takes, so which
 * characters are props and how big they are is read off the legend itself and
 * not copied into the tool (AGENTS.md rule 9). The probe keeps the room's
 * height, its last row standing in for the floor, because a waterfall hangs
 * from its surface tile down to the bottom row.
 */
function outlineBrush(cell: Cell): void {
  const rows = map.rows.length;
  const probe = Array.from({ length: rows }, (_, row) => {
    if (row === cell.y) {
      return brush;
    }

    return row === rows - 1 ? '#' : EMPTY;
  }).join('\n');
  const prop = parseRoom(probe).props[0];
  const left = cell.x * TILE_PX;

  ink.strokeStyle = colourOf(brush);

  if (prop === undefined) {
    ink.strokeRect(left + 0.5, cell.y * TILE_PX + 0.5, TILE_PX - 1, TILE_PX - 1);
    return;
  }

  ink.strokeRect(left + 0.5, prop.y * RENDER_DENSITY + 0.5, prop.w * RENDER_DENSITY - 1, prop.h * RENDER_DENSITY - 1);
}

/** The painting under the grid, the characters over it, and the brush preview. */
function drawSheet(): void {
  const width = Math.max(widthOf(map) * TILE_PX, painting?.width ?? 0);
  const height = Math.max(map.rows.length * TILE_PX, painting?.height ?? 0);

  // Assigning either size drops the canvas' whole backing store, so the sheet
  // is only resized when it really changed size.
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ink.clearRect(0, 0, width, height);

  if (painting !== null) {
    ink.drawImage(painting, 0, 0);
  }

  ink.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ink.beginPath();

  for (let x = 0; x <= width; x += TILE_PX) {
    ink.moveTo(x + 0.5, 0);
    ink.lineTo(x + 0.5, height);
  }

  for (let y = 0; y <= height; y += TILE_PX) {
    ink.moveTo(0, y + 0.5);
    ink.lineTo(width, y + 0.5);
  }

  ink.stroke();
  ink.font = `${TILE_PX / 2}px monospace`;
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';

  map.rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === EMPTY) {
        return;
      }

      ink.globalAlpha = 0.55;
      ink.fillStyle = colourOf(char);
      ink.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      ink.globalAlpha = 1;
      ink.fillStyle = '#0c0f14';
      ink.fillText(char, (x + 0.5) * TILE_PX, (y + 0.5) * TILE_PX);
    });
  });

  if (hover !== null) {
    outlineBrush(hover);
  }
}

function render(): void {
  drawSheet();
  status.textContent = [
    `${name} — ${widthOf(map)} x ${map.rows.length} tiles`,
    painting === null ? 'no painting' : `painting ${painting.width / TILE_PX} tiles wide`,
    `brush ${brush === EMPTY ? 'erase' : brush}`,
    message,
  ].join(' · ');
}

function say(said: string): void {
  message = said;
  render();
}

/** The room's painting as the asset kit built it, if it has one yet. */
async function paintingFor(room: string): Promise<HTMLImageElement | null> {
  const image = new Image();

  image.src = `/assets/paintings/${room}.png`;

  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** The picker standing on a room, which a new or just-saved one may be missing from. */
function pick(room: string): void {
  if ([...roomPicker.options].some((option) => option.value === room)) {
    roomPicker.value = room;
    return;
  }

  roomPicker.append(new Option(room, room, false, true));
}

/** Show a room: its module if it has one, otherwise a blank map to trace. */
async function open(room: string): Promise<void> {
  const source = roomSources.get(room);

  name = room;
  pick(room);
  window.location.hash = encodeURIComponent(room);
  map = source === undefined ? blank(room) : parse(source);
  past = [];
  widthInput.value = String(widthOf(map));
  heightInput.value = String(map.rows.length);
  painting = await paintingFor(room);
  say(source === undefined ? 'new room, not saved yet' : 'opened');
}

/** The painting's alpha channel, which is all auto-trace reads of it. */
function opacityOf(image: HTMLImageElement): Opacity {
  const sheet = document.createElement('canvas');

  sheet.width = image.width;
  sheet.height = image.height;

  const sheetInk = context(sheet);

  sheetInk.drawImage(image, 0, 0);

  const { data } = sheetInk.getImageData(0, 0, image.width, image.height);
  const alpha = new Uint8Array(image.width * image.height);

  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    alpha[pixel] = data[pixel * 4 + 3] ?? 0;
  }

  return { width: image.width, height: image.height, alpha };
}

/** Post one save to the dev server, which is the only writer of files here. */
async function post(path: string, payload: unknown): Promise<string> {
  const answer = await fetch(path, { method: 'POST', body: JSON.stringify(payload) });
  const said = await answer.text();

  if (!answer.ok) {
    throw new Error(said);
  }

  return said;
}

/** The PNG a file input holds, as the base64 the endpoint takes. */
function base64(file: File): Promise<string> {
  return new Promise((done, failed) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => done(String(reader.result).split(',')[1] ?? ''));
    reader.addEventListener('error', () => failed(reader.error ?? new Error(`cannot read ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

/** The tile the pointer is over; the canvas is drawn at its own pixel size. */
function cellAt(event: PointerEvent): Cell {
  const box = canvas.getBoundingClientRect();

  return {
    x: Math.floor((event.clientX - box.left) / TILE_PX),
    y: Math.floor((event.clientY - box.top) / TILE_PX),
  };
}

/** The rectangle of tiles two cells stand at the corners of. */
function between(from: Cell, to: Cell): TileBox {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(from.x - to.x) + 1,
    h: Math.abs(from.y - to.y) + 1,
  };
}

for (const { char, label, colour } of BRUSHES) {
  const button = document.createElement('button');

  button.value = char;
  button.textContent = char === EMPTY ? '␣' : char;
  button.title = label;
  button.style.color = colour;
  button.addEventListener('click', () => {
    brush = char;
    brushBar.querySelectorAll('button').forEach((other) => other.classList.toggle('on', other.value === char));
    render();
  });
  brushBar.append(button);
}

for (const room of roomSources.keys()) {
  roomPicker.append(new Option(room, room));
}

roomPicker.addEventListener('change', () => void open(roomPicker.value));

element('new').addEventListener('click', () => {
  const wanted = window.prompt('New room name, as game/content/rooms/<name>.ts');

  // Cancel, and an empty box, both leave the page where it is: an unnamed
  // room has nothing the save endpoint would accept as a file name anyway.
  if (wanted !== null && wanted.trim() !== '') {
    void open(wanted.trim());
  }
});

/**
 * A size box's value, held to the min and max index.html declares on the box
 * itself rather than to a second copy of those numbers here. An empty or
 * unreadable box keeps the size the map already has instead of resizing it to
 * nothing.
 */
function sizeOf(input: HTMLInputElement, standing: number): number {
  const wanted = Math.round(Number(input.value));

  if (input.value.trim() === '' || !Number.isFinite(wanted)) {
    return standing;
  }

  return Math.min(Math.max(wanted, Number(input.min)), Number(input.max));
}

for (const input of [widthInput, heightInput]) {
  input.addEventListener('change', () => {
    const width = sizeOf(widthInput, widthOf(map));
    const height = sizeOf(heightInput, map.rows.length);

    remember();
    map = resize(map, width, height);
    widthInput.value = String(width);
    heightInput.value = String(height);
    say('resized');
  });
}

canvas.addEventListener('pointerdown', (event) => {
  const cell = cellAt(event);

  remember();
  map = event.shiftKey && anchor !== null ? fill(map, between(anchor, cell), brush) : set(map, cell.x, cell.y, brush);
  anchor = cell;
  hover = cell;
  render();
});

canvas.addEventListener('pointermove', (event) => {
  const cell = cellAt(event);

  // A tile is 32 pixels wide, so crossing one fires many moves that would each
  // draw the same sheet again; only a new tile is worth the work.
  if (hover !== null && cell.x === hover.x && cell.y === hover.y) {
    return;
  }

  hover = cell;

  // Held down, the pointer keeps painting: a stroke is one entry of undo, not
  // one per tile it crossed.
  if (event.buttons === 1) {
    map = set(map, cell.x, cell.y, brush);
    anchor = cell;
  }

  render();
});

canvas.addEventListener('pointerleave', () => {
  hover = null;
  render();
});

element('auto').addEventListener('click', () => {
  if (painting === null) {
    say('this room has no painting under public/assets/paintings/ to trace');
    return;
  }

  remember();
  map = autoTrace(map, opacityOf(painting));
  say('auto-traced; fix the edges by hand');
});

element('undo').addEventListener('click', () => {
  const previous = past.pop();

  if (previous === undefined) {
    say('nothing to undo');
    return;
  }

  map = previous;
  say('undone');
});

element('save').addEventListener('click', () => {
  void post('/__trace/room', { name, source: serialise(map) })
    .then((file) => say(`saved ${file}; play it with ?room=${name}`))
    .catch((error: unknown) => say(String(error)));
});

element<HTMLInputElement>('png').addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];

  if (file === undefined) {
    return;
  }

  void base64(file)
    .then((png) => post('/__trace/painting', { name, panel: Number(element<HTMLInputElement>('panel').value), png }))
    // The kit builds the panels tools/asset-kit/paintings.ts lists, so a panel
    // for a room that table does not carry yet has to be declared there first.
    .then((written) => say(`saved ${written}; declare it in tools/asset-kit/paintings.ts and run pnpm assets`))
    .catch((error: unknown) => say(String(error)));
});

await open(name);
