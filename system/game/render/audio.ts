// Sound, played from what the simulation said happened
// (docs/plan/02-design/simulation-architecture.md, and the atmosphere and
// audio brief). Every effect is one entry of `state.events`, played on the
// tick it appears and never again: nothing here counts frames, measures
// elapsed time or watches the player's state, so a replay plays the same
// sounds in the same order however fast the machine draws it. The one thing
// it does not do is start a second copy of a sound over the copy already
// playing — see `REPEAT_GAP_TICKS`, which measures that gap in ticks too.
//
// The browser's own rule shapes the rest of the module. A page may make no
// sound before the visitor has touched it, so there is no AudioContext until a
// gesture has happened, and nothing is fetched or decoded before one either: a
// page that decoded two megabytes of MP3 on load would have spent them before
// knowing whether anybody was listening.

import type { Prop, WorldState } from '../sim';

import type { Camera } from './camera';
import { loadManifest, soundOf, soundUrl } from './sprites';
import { onScreen } from './waterfall';

/**
 * What one entry of `state.events` sounds like
 * (docs/plan/03-assets/prompts/audio.md). This table is the whole mapping:
 * tests/render/audio.test.ts reads it rather than keeping a second copy of it,
 * so a sound that moves to another event moves here alone.
 *
 * `death` and `victory` are deliberately silent. The asset list carries no
 * sound for either — a respawn is told by the screen, and the run's own ending
 * is the beacon's swell a moment later — so they pass through making nothing.
 */
export const EVENT_SOUNDS: Readonly<Record<string, string>> = {
  jump: 'audio/jump',
  land: 'audio/land',
  charge: 'audio/charge',
  'charge:wall': 'audio/charge-wall',
  'charge:hit:bush': 'audio/bush-rustle',
  'charge:hit:log': 'audio/log-chatter',
  'charge:hit:rock': 'audio/rock-crack',
  'creature:out': 'audio/creature-pop-out',
  'creature:caught': 'audio/creature-caught',
  'flag:raised': 'audio/checkpoint',
  'beacon:lit': 'audio/beacon-lit',
};

/** The events every prop's own charge hit shares, and what the rest sound like. */
const CHARGE_HIT = 'charge:hit:';
const CHARGE_HIT_SOUND = 'audio/charge-hit';

/** The water under the rock face; its loop runs while the view holds any of it. */
export const WATERFALL_SOUND = 'audio/waterfall-loop';

/** The one theme, behind the settings toggle (game/render/settings.ts). */
export const MUSIC_SOUND = 'audio/music-loop';

/**
 * What one event sounds like, or nothing when it is one of the silent two. A
 * bush, a log and a rock answer for themselves; every other prop the crystal
 * tip stamps is the plain thump of a charge landing.
 */
export function soundFor(event: string): string | undefined {
  return EVENT_SOUNDS[event] ?? (event.startsWith(CHARGE_HIT) ? CHARGE_HIT_SOUND : undefined);
}

/** What a tick's events sound like, in the order the simulation emitted them. */
export function soundsFor(events: readonly string[]): string[] {
  return events.map(soundFor).filter((sound) => sound !== undefined);
}

/**
 * Ticks one sound keeps to itself. A second copy of the same sound asked for
 * inside this many ticks of the last is dropped rather than started on top of
 * the copy already playing.
 *
 * `game/sim/charge-hit.ts` stamps a prop once per tick for as long as the
 * crystal tip is over it, so one charge through a bush emits nine
 * `charge:hit:bush` on nine consecutive ticks. Played literally that is nine
 * copies of the same 0.5 s rustle a sixtieth of a second apart — nine times
 * the gain and a comb filter out of the offsets — where the brief asked each
 * effect to be a "dry, single sound" (docs/plan/03-assets/prompts/audio.md).
 *
 * The gap is counted in ticks off `WorldState.tick`, never in wall time or
 * frames, so a replay drops exactly the same copies however fast the machine
 * draws it. 15 sits comfortably under `CHARGE_COOLDOWN_TICKS` (24), the
 * tightest gap at which the simulation can emit the same sound twice for two
 * separate things the player did, so no repeat a visitor could tell apart is
 * swallowed.
 */
export const REPEAT_GAP_TICKS = 15;

/**
 * Which of a tick's sounds actually start, given the tick they are asked on.
 * The gate remembers the tick each name was last started on; a tick at or
 * before that one is a fresh run — the restart key builds a new world back at
 * tick 0 — and is let through rather than held back by the run before it.
 */
export function createRepeatGate(): (name: string, tick: number) => boolean {
  const started = new Map<string, number>();

  return (name, tick) => {
    const last = started.get(name);

    if (last !== undefined && tick >= last && tick - last < REPEAT_GAP_TICKS) {
      return false;
    }

    started.set(name, tick);

    return true;
  };
}

/** One sound that runs until it is stopped: the waterfall's, and the music's. */
interface Loop {
  /** Ask for it, or take the ask back. */
  set(on: boolean): void;
  /** Ask again for whatever was last asked for, now that a context exists. */
  retry(): void;
  /** Is it running, or on its way to running? */
  running(): boolean;
}

/** The room's waterfall, if it has one. A room places at most the one. */
function waterfallOf(state: WorldState): Prop | undefined {
  return state.props.find((prop) => prop.kind === 'waterfall');
}

/**
 * Should the waterfall loop be running for this view? A room without a
 * waterfall is silent, and a room with one is heard exactly while the camera
 * holds any part of it — "drawn only when on screen"
 * (docs/plan/02-design/rendering-and-look.md). Whether the sheet is parted
 * makes no difference: the water falls either way.
 *
 * It is its own function so the rule can be read by tests/render/audio.test.ts
 * without a browser; `watch` below is the one line that applies it.
 */
export function waterfallHeard(state: WorldState, camera: Camera): boolean {
  const water = waterfallOf(state);

  return water !== undefined && onScreen(water, camera);
}

export interface Audio {
  /**
   * Play what this tick's events call for, in the order they came, a repeat of
   * a sound still ringing apart (`REPEAT_GAP_TICKS`).
   */
  update(state: WorldState): void;
  /** Run the loops this frame's view calls for, which is the waterfall's. */
  watch(state: WorldState, camera: Camera): void;
  /** Ask for the music loop, or for silence; it waits for a gesture to start. */
  setMusic(on: boolean): void;
  /** The loops running right now, for the browser tests to read. */
  report(): string;
}

/** One sound ready to play: the decoded file, and whether it repeats. */
interface Sound {
  buffer: AudioBuffer;
  loop: boolean;
}

export async function createAudio(): Promise<Audio> {
  const manifest = await loadManifest();
  const decoded = new Map<string, Sound>();
  /** The context the browser only grants after a gesture; silence until then. */
  let context: AudioContext | undefined;

  /** Fetch and decode one sound, once; a second ask gets the first decode. */
  async function load(name: string, ready: AudioContext): Promise<Sound> {
    const held = decoded.get(name);

    if (held !== undefined) {
      return held;
    }

    const buffer = await ready.decodeAudioData(await (await fetch(soundUrl(name))).arrayBuffer());
    // Which sounds repeat is the kit's answer, recorded per file, so the
    // player obeys the manifest rather than keeping a list of its own.
    const sound = { buffer, loop: soundOf(manifest, name).loop };

    decoded.set(name, sound);

    return sound;
  }

  /** Start one sound now, through to its end or round again if it loops. */
  function start(sound: Sound, ready: AudioContext): AudioBufferSourceNode {
    const source = ready.createBufferSource();

    source.buffer = sound.buffer;
    source.loop = sound.loop;
    source.connect(ready.destination);
    source.start();

    return source;
  }

  /** Play one sound. Before the gesture there is nothing to play it with. */
  function play(name: string): void {
    const ready = context;

    if (ready !== undefined) {
      void load(name, ready).then((sound) => start(sound, ready));
    }
  }

  /**
   * One sound that runs until it is asked to stop. What it was asked for is
   * remembered whether or not there is a context yet, so a loop wanted before
   * the gesture starts itself on the gesture that finally allows it.
   */
  function createLoop(name: string): Loop {
    let wanted = false;
    let loading = false;
    let source: AudioBufferSourceNode | undefined;

    function set(on: boolean): void {
      wanted = on;

      const ready = context;

      if (!on) {
        source?.stop();
        source = undefined;

        return;
      }

      // `loading` is what keeps the next frame from starting the loop a second
      // time while the first ask is still decoding; the ask may have been
      // taken back by the time it lands, which is what `wanted` then says.
      if (ready === undefined || loading || source !== undefined) {
        return;
      }

      loading = true;

      void load(name, ready).then((sound) => {
        loading = false;

        if (wanted) {
          source = start(sound, ready);
        }
      });
    }

    return {
      set,
      /** Ask again for whatever was last asked for. */
      retry: () => set(wanted),
      running: () => wanted && (loading || source !== undefined),
    };
  }

  const loops = [createLoop(WATERFALL_SOUND), createLoop(MUSIC_SOUND)] as const;
  const [waterfall, music] = loops;
  /** One sound per event, the brief's repeats apart; see `REPEAT_GAP_TICKS`. */
  const allows = createRepeatGate();

  /**
   * The first touch of the page, and the only one that matters: a context may
   * exist from here on, so every loop that was asked for meanwhile starts.
   */
  function gesture(): void {
    window.removeEventListener('pointerdown', gesture);
    window.removeEventListener('keydown', gesture);

    if (window.AudioContext === undefined) {
      return;
    }

    context = new window.AudioContext();
    void context.resume();

    for (const loop of loops) loop.retry();
  }

  window.addEventListener('pointerdown', gesture);
  window.addEventListener('keydown', gesture);

  return {
    update(state: WorldState): void {
      for (const sound of soundsFor(state.events)) {
        if (allows(sound, state.tick)) {
          play(sound);
        }
      }
    },

    watch(state: WorldState, camera: Camera): void {
      waterfall.set(waterfallHeard(state, camera));
    },

    setMusic(on: boolean): void {
      music.set(on);
    },

    report(): string {
      return [waterfall.running() && 'waterfall', music.running() && 'music'].filter(Boolean).join(' ');
    },
  };
}
