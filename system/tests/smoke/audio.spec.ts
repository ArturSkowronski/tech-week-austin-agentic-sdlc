// Sound in a real browser: the kit's fourteen files are in the manifest and
// are served, and the ambience loop waits for the visitor to touch the page
// and starts itself on that touch
// (docs/plan/03-assets/pipeline.md; the atmosphere and audio brief).
//
// The AudioContext is stubbed rather than used. A headless Chromium has no
// sound device, and what is being asserted is which file the page asked for
// and whether it set the loop going, which the stub can say exactly.

import { expect, test, type Page } from '@playwright/test';

import { AMBIENCE_SOUND, WATERFALL_SOUND } from '../../game/render/audio';
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
 * A page whose AudioContext is a recorder, installed before the bundle runs,
 * so the page never sees the real one.
 */
async function stubbed(page: Page): Promise<void> {
  await page.addInitScript(() => {
      const log: Recorder = { asked: [], started: [] };

      window.audioLog = log;

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
        currentTime = 0;

        resume(): Promise<void> {
          return Promise.resolve();
        }

        createGain(): unknown {
          return {
            gain: { value: 1, setTargetAtTime: (): void => undefined },
            connect: (): void => undefined,
          };
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
  });

  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);
}

/** The sounds the page has asked the server for so far. */
function asked(page: Page): Promise<string[]> {
  return page.evaluate(() => window.audioLog.asked);
}

test('the manifest carries the fourteen sounds, and the kit serves every one', async ({ page }) => {
  await stubbed(page);

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

  expect(looping.sort()).toEqual([AMBIENCE_SOUND, WATERFALL_SOUND].sort());
});

test('nothing is heard before the page is touched, and the ambience starts on the touch', async ({ page }) => {
  await stubbed(page);

  const canvas = page.locator('#game canvas');

  // The page has not been touched: nothing fetched, no loop running.
  expect(await asked(page)).toEqual([]);
  await expect(canvas).toHaveAttribute('data-audio', '');

  // Enter is the gesture the browser demands before a page may make any sound.
  await page.keyboard.press('Enter');
  await expect.poll(() => asked(page)).toContain(AMBIENCE_SOUND);
  await expect(canvas).toHaveAttribute('data-audio', /ambience/);

  // And it was started as a loop, not played through once.
  expect(await page.evaluate(() => window.audioLog.started.some((source) => source.loop))).toBe(true);
});

test('an effect follows its simulation event once the page has been touched', async ({ page }) => {
  await stubbed(page);

  await page.keyboard.press('Enter');

  // The jump is driven through `window.wizard` (AGENTS.md rule 8), the way the
  // rest of the suite drives the simulation, rather than by pressing ArrowUp.
  // ArrowUp is a *held* button: game/render/input.ts samples `held` once a
  // frame, so a press and release a CDP round trip apart may fall wholly
  // between two frames and no tick ever see the jump. Stepping a paused clock
  // makes the tick that emits the event a certainty, which is what a test
  // about a sound following a simulation event wants.
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
    // Settle on the ground first; the jump is then the next tick's event.
    window.wizard.step(8);
    window.wizard.step(8, { jump: true });
  });

  await expect.poll(() => asked(page)).toContain('audio/jump');
});
