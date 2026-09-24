// The Pixi application and the two surfaces everything else draws on
// (docs/plan/02-design/rendering-and-look.md, ADR-003): the world goes into a
// 640 by 360 render texture at two pixels per world unit, and that texture is
// shown at the largest even scale the window allows, letterboxed and
// nearest-neighbour. The UI draws above it at the window's own resolution, so
// text stays crisp however large the blocks below it are.

import { Application, Container, Graphics, RenderTexture, Sprite, TilingSprite } from 'pixi.js';

import type { Room, WorldState } from '../sim';

import { floorLine, follow, restCamera, wholePixels, type Camera } from './camera';
import {
  BASE_COLOURS,
  LAYERS,
  LETTERBOX_COLOUR,
  RENDER_DENSITY,
  SCALE_STEP,
  SKY_BAND_H,
  SKY_STOPS,
  TEXTURE_H,
  TEXTURE_W,
  VIEW_H,
  VIEW_W,
  type Layer,
} from './config';
import { loadArt, loadManifest, type Art } from './sprites';

export interface Scene {
  /**
   * The world, in world units. Drawn into the render texture through the
   * container's own 2x, so children of it measure in units, never in pixels.
   */
  readonly world: Container;
  /**
   * The room, its props and the wizard, in world units. The layer is moved by
   * the camera, so what is added to it is placed in world coordinates.
   */
  readonly actors: Container;
  /**
   * The additive light layer, above the actors and behind the bushes in front
   * (rendering-and-look.md, layer stack). Moved by the camera as well.
   */
  readonly lights: Container;
  /** Where the camera stands, in world units; the origin until the first watch. */
  readonly camera: Camera;
  /** The overlay, in window pixels. Drawn straight to the canvas on top. */
  readonly ui: Container;
  /** The canvas the two are drawn on; what the fit produced is published on it. */
  readonly canvas: HTMLCanvasElement;
  /** Move the camera and the layer stack to where the world now is. */
  watch(state: WorldState): void;
  /** Draw one frame. */
  render(): void;
}

/** Where the camera reads as standing before the first frame moves it. */
const ORIGIN: Camera = { x: 0, y: 0 };

/** One layer of the stack, drawn across the view and looping horizontally. */
interface Backdrop {
  layer: Layer;
  art: Art;
  sprite: TilingSprite;
}

/**
 * A tint that keeps this share of a layer's own colour: the depth haze of the
 * dusk pass, which is a plain multiply because it only ever fades a layer back.
 */
function haze(share: number): number {
  const channel = Math.round(share * 0xff);

  return (channel << 16) | (channel << 8) | channel;
}

/** Two colours mixed channel by channel. */
function mix(from: number, to: number, share: number): number {
  const channel = (shift: number): number =>
    Math.round(((from >> shift) & 0xff) * (1 - share) + ((to >> shift) & 0xff) * share) << shift;

  return channel(16) | channel(8) | channel(0);
}

/** The sky at a share of the way from the horizon to the top of the view. */
function skyColour(share: number): number {
  const [amber, mauve, indigo] = SKY_STOPS;

  return share < 0.5 ? mix(amber, mauve, share * 2) : mix(mauve, indigo, share * 2 - 1);
}

/**
 * The dusk sky: bands of six units from the horizon up through the three
 * stops, and below the horizon the mountains' own base colour, so no pale gap
 * shows between the layers when the camera climbs (rendering-and-look.md).
 */
function drawSky(sky: Graphics, horizon: number): void {
  sky.clear();
  sky.rect(0, horizon, VIEW_W, Math.max(0, VIEW_H - horizon)).fill(BASE_COLOURS.mountains);

  for (let band = 0; band * SKY_BAND_H < horizon; band += 1) {
    const middle = ((band + 0.5) * SKY_BAND_H) / horizon;

    sky
      .rect(0, horizon - (band + 1) * SKY_BAND_H, VIEW_W, SKY_BAND_H)
      .fill(skyColour(Math.min(middle, 1)));
  }
}

/** The stack of the look doc's table, loaded from the asset kit's manifest. */
interface Background {
  /** The sky, the mountains, the tall forest and the bushes behind the room. */
  readonly behind: Container;
  /** The bushes the wizard runs behind. */
  readonly inFront: Container;
  /** Put every layer where this camera sees it. */
  place(camera: Camera, room: Room): void;
  /**
   * The top edge of every layer, the horizon and how many times the sky has
   * been drawn, measured off the objects the way the fit below is.
   */
  report(): string;
}

async function createBackground(): Promise<Background> {
  const manifest = await loadManifest();

  async function backdrop(layer: Layer): Promise<Backdrop> {
    const art = await loadArt(manifest, layer.asset);
    const sprite = new TilingSprite({ texture: art.texture, width: VIEW_W, height: art.height });

    sprite.tileScale.set(1 / art.density);
    sprite.alpha = layer.alpha;
    sprite.tint = haze(layer.tint);

    return { layer, art, sprite };
  }

  const sky = new Graphics();
  const behind = new Container();
  const inFront = new Container();
  // The table of the look doc, back to front, all four files at once.
  const [mountains, trees, bushes, front] = await Promise.all([
    backdrop(LAYERS.mountains),
    backdrop(LAYERS.tallForest),
    backdrop(LAYERS.bushesBehind),
    backdrop(LAYERS.bushesFront),
  ]);
  const stack = [mountains, trees, bushes, front];

  behind.addChild(sky, mountains.sprite, trees.sprite, bushes.sprite);
  inFront.addChild(front.sprite);

  /** The horizon the sky was last drawn for; it is redrawn only when it moves. */
  let drawnAt = Number.NaN;
  let skies = 0;

  return {
    behind,
    inFront,

    place(camera: Camera, room: Room): void {
      const rest = restCamera(room);
      // Every bottom offset is read off the floor line as it stands on screen
      // with the camera at rest; from there each layer takes its own share of
      // however far the camera has travelled.
      const floor = floorLine(room) - rest.y;

      for (const { layer, art, sprite } of stack) {
        const bottom = floor + layer.bottomOffset - (camera.y - rest.y) * layer.parallaxY;

        sprite.tilePosition.x = wholePixels(-(camera.x - rest.x) * layer.parallaxX);
        sprite.y = wholePixels(bottom - art.height);
      }

      // The sky is anchored to the mountains' art base, which is the horizon.
      const horizon = mountains.sprite.y + mountains.art.artHeight;

      if (horizon !== drawnAt) {
        drawnAt = horizon;
        skies += 1;
        drawSky(sky, horizon);
      }
    },

    report(): string {
      const tops = stack.map(({ layer, sprite }) => `${layer.asset}=${sprite.y}`).join(' ');

      return `${tops} horizon=${drawnAt} skies=${skies}`;
    },
  };
}

/**
 * Window pixels per world unit: the largest multiple of two whose view fits,
 * never below two, so the render texture's pixels stay whole (ADR-003).
 */
function displayScale(windowW: number, windowH: number): number {
  const steps = Math.floor(Math.min(windowW / VIEW_W, windowH / VIEW_H) / SCALE_STEP);

  return Math.max(steps, 1) * SCALE_STEP;
}

/** Start Pixi in `mount` and give back the surfaces to draw on. */
export async function createScene(mount: HTMLElement): Promise<Scene> {
  const app = new Application();

  await app.init({
    background: LETTERBOX_COLOUR,
    antialias: false,
    // The loop in game/main.ts decides when a frame is drawn.
    autoStart: false,
    // One canvas pixel per window pixel. Drawing at the screen's device pixels
    // instead would buy the UI nothing the look doc asks for — its font is a
    // pixel font, meant to be shown in whole blocks — and would cost the rule
    // this file is built on: a fractional device ratio makes a texture pixel a
    // fraction of a device pixel, which is the one thing ADR-003's even scale
    // exists to prevent. The plan's acceptance reads the same way: a 1280 by
    // 720 window is a 1280 by 720 canvas.
    resolution: 1,
    autoDensity: false,
  });

  const texture = RenderTexture.create({
    width: TEXTURE_W,
    height: TEXTURE_H,
    scaleMode: 'nearest',
  });
  const view = new Sprite(texture);
  const world = new Container();
  const actors = new Container();
  const lights = new Container();
  const ui = new Container();
  const background = await createBackground();

  world.addChild(background.behind, actors, lights, background.inFront);

  // The density of ADR-003, as the transform it has to be: the texture is
  // 640 by 360 pixels and holds a 320 by 180 view, so a world unit is two
  // texture pixels and a 16-unit tile covers 32 of them. Sizing the texture
  // alone would leave the world at one pixel per unit and show twice the
  // world the camera, the layer stack and the tuning table assume.
  world.scale.set(RENDER_DENSITY);

  app.stage.addChild(view, ui);

  // index.html carries no stylesheet, so the canvas is placed from here. Fixed
  // and clipped means the window never grows a scrollbar that would shrink the
  // very size the fit below is measured against.
  mount.style.position = 'fixed';
  mount.style.inset = '0';
  mount.style.overflow = 'hidden';
  app.canvas.style.display = 'block';
  // A screen with more device pixels than window pixels rescales the canvas
  // itself, and the browser would smooth it: nearest-neighbour everywhere
  // (rendering-and-look.md) has to survive that last step too.
  app.canvas.style.imageRendering = 'pixelated';
  mount.appendChild(app.canvas);

  function fit(): void {
    const { innerWidth, innerHeight } = window;
    const scale = displayScale(innerWidth, innerHeight);

    app.renderer.resize(innerWidth, innerHeight);
    view.scale.set(scale / RENDER_DENSITY);
    view.position.set(
      Math.floor((innerWidth - VIEW_W * scale) / 2),
      Math.floor((innerHeight - VIEW_H * scale) / 2),
    );
    // What the fit produced, measured off the objects themselves so a browser
    // test reads the result and not the rule: the box the view sprite occupies
    // on screen, and the world units that box shows across. The second divides
    // the texture's own width by the world container's own scale, so it says
    // 640 instead of 320 the moment the density stops reaching the world.
    app.canvas.dataset['view'] = `${view.width}x${view.height}@${view.x},${view.y}`;
    app.canvas.dataset['units'] = String(texture.width / world.scale.x);
  }

  fit();
  window.addEventListener('resize', fit);

  /** Undefined until the first frame, which starts the camera at rest. */
  let camera: Camera | undefined;
  let layers = '';

  return {
    world,
    actors,
    lights,
    ui,
    canvas: app.canvas,

    get camera(): Camera {
      return camera ?? ORIGIN;
    },

    watch(state: WorldState): void {
      camera = follow(camera ?? restCamera(state.room), state);
      // Everything in world coordinates is drawn by moving its layer under
      // the camera, so a sprite is placed where the world says it is.
      actors.position.set(-camera.x, -camera.y);
      lights.position.set(-camera.x, -camera.y);
      background.place(camera, state.room);
      // Written only when it changes, the way the fit above is written.
      const report = background.report();

      if (report !== layers) {
        layers = report;
        app.canvas.dataset['layers'] = report;
      }
    },

    render(): void {
      app.renderer.render({ container: world, target: texture });
      app.renderer.render(app.stage);
    },
  };
}
