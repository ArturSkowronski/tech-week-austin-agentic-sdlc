// The Pixi application and the two surfaces everything else draws on
// (docs/plan/02-design/rendering-and-look.md, ADR-003): the world goes into a
// 640 by 360 render texture at two pixels per world unit, and that texture is
// shown at the largest even scale the window allows, letterboxed and
// nearest-neighbour. The UI draws above it at the window's own resolution, so
// text stays crisp however large the blocks below it are.

import { Application, Container, Graphics, RenderTexture, Sprite, TilingSprite } from 'pixi.js';

import type { Room, Vec2, WorldState } from '../sim';

import { floorLine, follow, restCamera, wholePixels, type Camera } from './camera';
import {
  BASE_COLOURS,
  DEBUG_TILE_ALPHA,
  DUSK_ALPHA,
  DUSK_COLOUR,
  LAYERS,
  LETTERBOX_COLOUR,
  PAINTING_TINT,
  RENDER_DENSITY,
  SKY_BAND_H,
  SKY_STOPS,
  TEXTURE_H,
  TEXTURE_W,
  VIEW_H,
  VIEW_W,
  VIGNETTE,
  VIGNETTE_DEPTH,
  duskAlpha,
  mix,
  viewBox,
  type Layer,
} from './config';
import { createParticles } from './particles';
import { loadArt, loadManifest, type Art, type Manifest } from './sprites';
import { drawTiles, loadTileset, type Tileset } from './tiles';

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
  /**
   * Move the camera and the layer stack to where the world now is, and draw
   * the room behind it. Behind F1 the tiles join a painted room as well.
   * `crystal` is where the wand's light stands this frame, which the
   * atmosphere pass hangs its motes on (game/render/wizard.ts).
   */
  watch(state: WorldState, debug: boolean, crystal: Vec2): void;
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
  /**
   * The sky, the mountains, the tall forest, the fireflies out among its
   * trunks and the bushes behind the room.
   */
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

/**
 * `amongTrunks` is laid into the stack between the tall forest and the bushes
 * behind it, which is where the look doc's table puts anything standing out
 * in the backdrop forest; it is placed by the caller, with the tall forest's
 * own factors (rendering-and-look.md, "Layer stack, back to front").
 */
async function createBackground(manifest: Manifest, amongTrunks: Container): Promise<Background> {
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

  behind.addChild(sky, mountains.sprite, trees.sprite, amongTrunks, bushes.sprite);
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
 * The room itself, between the backdrops and the actors: the painting the kit
 * built for it drawn 1:1, or the tiles where it has none (ADR-004). A painting
 * is the look of its room and hides the tiles; F1 brings them back over it at
 * half alpha, which is how the debug view shows what the wizard collides with.
 */
interface RoomArt {
  /** Painting and tiles together, in world units, moved by the camera. */
  readonly view: Container;
  /** Draw this room, and show or hide the tiles for this debug state. */
  draw(room: Room, debug: boolean): void;
  /** What it drew, measured off the objects the way the fit is. */
  report(): string;
}

async function createRoomArt(
  manifest: Manifest,
  tileset: Tileset,
  roomName: string,
): Promise<RoomArt> {
  const name = `paintings/${roomName}`;
  const painting = manifest[name] === undefined ? undefined : await loadArt(manifest, name);
  const view = new Container();

  if (painting !== undefined) {
    const sprite = new Sprite(painting.texture);

    // The painting is drawn at two pixels per world unit, so it covers its
    // room's tiles exactly when it is brought back to units.
    sprite.scale.set(1 / painting.density);
    sprite.tint = PAINTING_TINT;
    view.addChild(sprite);
  }

  /** The room's tiles, built the first time they are shown and kept after. */
  let tiles: Container | undefined;

  return {
    view,

    draw(room: Room, debug: boolean): void {
      const show = painting === undefined || debug;

      // A painted room's tiles are thousands of sprites nobody may ever ask
      // for, so they are built when F1 first asks and not before.
      if (show && tiles === undefined) {
        tiles = drawTiles(room, tileset);
        tiles.alpha = painting === undefined ? 1 : DEBUG_TILE_ALPHA;
        view.addChild(tiles);
      }

      if (tiles !== undefined) {
        tiles.visible = show;
      }
    },

    report(): string {
      const drawn = tiles?.visible === true ? tiles.children.length : 0;

      return `painting=${painting === undefined ? 'none' : roomName} tiles=${drawn} tileAlpha=${painting === undefined ? 1 : DEBUG_TILE_ALPHA}`;
    },
  };
}

/**
 * The dusk overlay of the look doc's table, over the whole stack and under the
 * UI: a translucent dark across the view, deepened towards the edges by the
 * vignette's rings until the outermost band carries all of them, so the
 * corners step down instead of fading. It goes on the render-texture root
 * rather than on one of the layers the camera moves, so it is drawn one time
 * and every frame shows the same of it.
 */
function createDusk(): Graphics {
  const dusk = new Graphics();
  const depth = VIGNETTE_DEPTH;

  // The middle of the view, which no ring reaches, and then a frame for each
  // band out to the edge. The frames are laid beside one another rather than
  // stacked, the rings adding up in duskAlpha instead of in the blend: the
  // stacked form drew the same picture but put tests/smoke/waterfall.spec.ts
  // over its timeout on the software renderer a browser test runs on.
  dusk
    .rect(depth, depth, VIEW_W - 2 * depth, VIEW_H - 2 * depth)
    .fill({ color: DUSK_COLOUR, alpha: DUSK_ALPHA });

  for (let ring = 0; ring < VIGNETTE.rings; ring += 1) {
    const near = ring * VIGNETTE.band;
    const middle = near + VIGNETTE.band / 2;

    dusk
      .rect(middle, middle, VIEW_W - 2 * middle, VIEW_H - 2 * middle)
      .stroke({ width: VIGNETTE.band, color: DUSK_COLOUR, alpha: duskAlpha(near) });
  }

  return dusk;
}

/**
 * Start Pixi in `mount` and give back the surfaces to draw on. The room is
 * named here rather than read off the first frame because its painting, if it
 * has one, is loaded with the backdrops.
 *
 * `atmosphere` is false only for the `?atmosphere=off` boot game/main.ts
 * reads: the run draws everything but the particle pass, which is how a
 * browser test measures what the pass costs on a machine whose frame rate
 * says nothing on its own (tests/smoke/particles.spec.ts).
 */
export async function createScene(
  mount: HTMLElement,
  roomName: string,
  atmosphere = true,
): Promise<Scene> {
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
  const manifest = await loadManifest();
  // The atmosphere pass (HWP-060), spread across the stack rather than laid
  // on as one layer: the fireflies in among the tall forest's trunks, moving
  // with them; the spores and the mist in front of the actors, so the bands
  // lie over the wizard's feet and over the water; and the motes on the
  // additive light layer with the wand's own glow.
  const particles = createParticles(atmosphere);
  // Neither the backdrops nor the room needs anything of the other, so both
  // chains are in flight at once.
  const tileset = await loadTileset(manifest);
  const [background, roomArt] = await Promise.all([
    createBackground(manifest, particles.forest),
    createRoomArt(manifest, tileset, roomName),
  ]);

  lights.addChild(particles.light);
  world.addChild(
    background.behind,
    roomArt.view,
    actors,
    particles.air,
    lights,
    background.inFront,
    createDusk(),
  );

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
    const { scale, x, y } = viewBox(innerWidth, innerHeight);

    app.renderer.resize(innerWidth, innerHeight);
    view.scale.set(scale / RENDER_DENSITY);
    view.position.set(x, y);
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
  /** What each report last said, so the canvas is written only when it changes. */
  const published = new Map<string, string>();

  function publish(name: string, report: string): void {
    if (published.get(name) !== report) {
      published.set(name, report);
      app.canvas.dataset[name] = report;
    }
  }

  return {
    world,
    actors,
    lights,
    ui,
    canvas: app.canvas,

    get camera(): Camera {
      return camera ?? ORIGIN;
    },

    watch(state: WorldState, debug: boolean, crystal: Vec2): void {
      camera = follow(camera ?? restCamera(state.room), state);
      // Everything in world coordinates is drawn by moving its layer under
      // the camera, so a sprite is placed where the world says it is.
      actors.position.set(-camera.x, -camera.y);
      particles.air.position.set(-camera.x, -camera.y);
      lights.position.set(-camera.x, -camera.y);
      roomArt.view.position.set(-camera.x, -camera.y);

      // The painting was chosen once, by name, when the scene was built; the
      // grid arrives every frame with whatever world the loop hands over. They
      // are one fact today only because game/main.ts passes one variable into
      // both. Should a second call site ever part them, a room would wear
      // another room's painting over its own collision and nothing on the
      // screen would say so — so it is said here instead.
      if (state.roomName !== roomName) {
        throw new Error(`the room art was built for ${roomName} and asked to draw ${state.roomName}`);
      }

      roomArt.draw(state.room, debug);
      background.place(camera, state.room);
      // The fireflies stand among the trunks, so they are carried by the tall
      // forest's own
      // parallax factors rather than pinned to the view: the layer table
      // anchors every layer to the floor line and gives it its own share of
      // the camera's travel, and a firefly that kept still while the forest
      // slid behind it would be the one thing in the stack that did not.
      const rest = restCamera(state.room);
      const trunks = LAYERS.tallForest;

      particles.update(state, crystal, {
        x: (camera.x - rest.x) * trunks.parallaxX,
        y: (camera.y - rest.y) * trunks.parallaxY,
      });
      publish('layers', background.report());
      publish('room', roomArt.report());
      publish('particles', particles.report());
    },

    render(): void {
      app.renderer.render({ container: world, target: texture });
      app.renderer.render(app.stage);
    },
  };
}
