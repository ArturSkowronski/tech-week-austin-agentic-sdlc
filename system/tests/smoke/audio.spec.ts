// Sound in a real browser: the kit's fourteen files are in the manifest and
// are served, and the music loop obeys both halves of its rule — the toggle
// has to be on and the visitor has to have touched the page
// (docs/plan/03-assets/pipeline.md; the atmosphere and audio brief).
//
// The AudioContext is stubbed rather than used. A headless Chromium has no
// sound device, and what is being asserted is which file the page asked for
// and whether it set the loop going, which the stub can say exactly.

import { expect, test, type Page } from '@playwright/test';

import { MUSIC_SOUND, WATERFALL_SOUND } from '../../game/render/audio';
import { MUSIC_KEY } from '../../game/render/settings';
import { CONSUMERS, type AudioEntry, type Manifest } from '../../game/render/sprites';

const VIEWPORT = { width: 1280, height: 720 };

/** The kit's sounds, by the names game/render/sprites.ts declares it loads. */
const SOUNDS = CONSUMERS.filter((name) => name.startsWith('audio/'));

/** What the stub below records, hung on the window for the test to read. */
interface Recorder {
  /** The sound files the page fetched, by name, in order. */
  asked: string[];
  /** One entry per source started, saying whether it was set to repeat. */
  started: { loop: boolean }[];
}

declare global {
  interface Window {
    audioLog: Recorder;
  }
}

test.use({ viewport: VIEWPORT });

/**
 * A page whose AudioContext is a recorder and whose music toggle is already
 * `kept`. Both are installed before the bundle runs, so the page never sees
 * the real one.
 */
async function stubbed(page: Page, kept: boolean): Promise<void> {
  await page.addInitScript(
    ([key, on]) => {
      const log: Recorder = { asked: [], started: [] };

      window.audioLog = log;

      if (on === 'on') {
        window.localStorage.setItem(key as string, 'on');
      }

      const fetched = window.fetch.bind(window);

      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : String((input as Request).url ?? input);

        if (url.includes('/assets/audio/')) {
          log.asked.push(`audio/${url.split('/').pop()?.replace('.mp3', '')}`);
        }

        return fetched(input, init);
      };

      class Recording {
        destination = {};

        resume(): Promise<void> {
          return Promise.resolve();
        }

        decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
          return Promise.resolve({ duration: bytes.byteLength });
        }

        createBufferSource(): unknown {
          const node = {
            buffer: null,
            loop: false,
            connect: (): void => undefined,
            stop: (): void => undefined,
            start: (): void => void log.started.push({ loop: node.loop }),
          };

          return node;
        }
      }

      (window as unknown as { AudioContext: unknown }).AudioContext = Recording;
    },
    [MUSIC_KEY, kept ? 'on' : 'off'] as const,
  );

  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);
}

/** The sounds the page has asked the server for so far. */
function asked(page: Page): Promise<string[]> {
  return page.evaluate(() => window.audioLog.asked);
}

test('the manifest carries the fourteen sounds, and the kit serves every one', async ({ page }) => {
  await stubbed(page, false);

  const entries = await page.evaluate(async (names: string[]) => {
    const manifest = (await (await fetch('assets/manifest.json')).json()) as Manifest;
    const served = await Promise.all(names.map(async (name) => (await fetch(`assets/${name}.mp3`)).ok));

    return names.map((name, index) => ({ name, entry: manifest[name], served: served[index] }));
  }, [...SOUNDS]);

  expect(entries).toHaveLength(14);

  for (const { name, entry, served } of entries) {
    expect(entry, `${name} is in the manifest`).toBeDefined();
    expect((entry as AudioEntry).kind, `${name} is recorded as a sound`).toBe('audio');
    expect((entry as AudioEntry).seconds, `${name} has a length`).toBeGreaterThan(0);
    expect(served, `${name}.mp3 is served`).toBe(true);
  }

  // Only the two the brief names repeat; every effect ends by itself.
  const looping = entries.filter(({ entry }) => (entry as AudioEntry).loop).map(({ name }) => name);

  expect(looping.sort()).toEqual([MUSIC_SOUND, WATERFALL_SOUND].sort());
});

test('the music waits for the toggle as well as for the gesture', async ({ page }) => {
  await stubbed(page, false);

  // Enter is the gesture the browser demands before a page may make any sound.
  // It is a one-shot edge, read by the frame loop whenever the frame comes.
  await page.keyboard.press('Enter');

  // The jump is then driven through `window.wizard` (AGENTS.md rule 8), the
  // way the rest of the suite drives the simulation, rather than by pressing
  // ArrowUp. ArrowUp is a *held* button: game/render/input.ts samples `held`
  // once a frame, so a press and release a CDP round trip apart may fall
  // wholly between two frames and no tick ever see the jump. Stepping a
  // paused clock makes the tick that emits the event a certainty, which is
  // what a test about a sound following a simulation event wants.
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
    // Settle on the ground first; the jump is then the next tick's event.
    window.wizard.step(8);
    window.wizard.step(8, { jump: true });
  });

  // The effects are heard from the first gesture, and the music still is not.
  await expect.poll(() => asked(page)).toContain('audio/jump');

  expect(await asked(page)).not.toContain(MUSIC_SOUND);
  await expect(page.locator('#game canvas')).toHaveAttribute('data-audio', '');
});

test('the music waits for the gesture as well as for the toggle', async ({ page }) => {
  await stubbed(page, true);

  const canvas = page.locator('#game canvas');

  // The toggle says on from the last visit, and the page has not been touched.
  await expect(canvas).toHaveAttribute('data-ui-music', /Music on/);
  expect(await asked(page)).toEqual([]);
  await expect(canvas).toHaveAttribute('data-audio', '');

  await page.keyboard.press('Enter');
  await expect.poll(() => asked(page)).toContain(MUSIC_SOUND);
  await expect(canvas).toHaveAttribute('data-audio', /music/);

  // And it was started as a loop, not played through once.
  expect(await page.evaluate(() => window.audioLog.started.some((source) => source.loop))).toBe(true);
});

test('the toggle is the press that both asks for the music and allows it', async ({ page }) => {
  await stubbed(page, false);

  const canvas = page.locator('#game canvas');

  await expect(canvas).toHaveAttribute('data-ui-music', /Music off/);

  // The toggle sits in the corner the HUD's line leaves free. The press is
  // the page's first gesture as well as its answer, so one click is the whole
  // of what the music waits for.
  await canvas.click({ position: { x: VIEWPORT.width - 80, y: 36 } });

  await expect(canvas).toHaveAttribute('data-ui-music', /Music on/);
  await expect.poll(() => asked(page)).toContain(MUSIC_SOUND);
  await expect(canvas).toHaveAttribute('data-audio', /music/);
});
