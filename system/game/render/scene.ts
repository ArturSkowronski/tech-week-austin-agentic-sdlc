// The Pixi application and the two surfaces everything else draws on
// (docs/plan/02-design/rendering-and-look.md, ADR-003): the world goes into a
// 640 by 360 render texture at two pixels per world unit, and that texture is
// shown at the largest even scale the window allows, letterboxed and
// nearest-neighbour. The UI draws above it at the window's own resolution, so
// text stays crisp however large the blocks below it are.

import { Application, Container, RenderTexture, Sprite } from 'pixi.js';

import {
  LETTERBOX_COLOUR,
  RENDER_DENSITY,
  SCALE_STEP,
  TEXTURE_H,
  TEXTURE_W,
  VIEW_H,
  VIEW_W,
} from './config';

export interface Scene {
  /**
   * The world, in world units. Drawn into the render texture through the
   * container's own 2x, so children of it measure in units, never in pixels.
   */
  readonly world: Container;
  /** The overlay, in window pixels. Drawn straight to the canvas on top. */
  readonly ui: Container;
  /** The canvas the two are drawn on; what the fit produced is published on it. */
  readonly canvas: HTMLCanvasElement;
  /** Draw one frame. */
  render(): void;
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
  const ui = new Container();

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

  return {
    world,
    ui,
    canvas: app.canvas,
    render(): void {
      app.renderer.render({ container: world, target: texture });
      app.renderer.render(app.stage);
    },
  };
}
