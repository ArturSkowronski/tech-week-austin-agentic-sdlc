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

import { PLAYER_WIDTH, type Prop, type WorldState } from '../sim';

import type { Camera } from './camera';
import { VIEW_W } from './config';
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

/**
 * The forest at night, under everything from the first touch of the page: a
 * bed, not a theme, so there is no toggle for it — the owner removed the one
 * the brief asked for along with the music it was for.
 */
export const AMBIENCE_SOUND = 'audio/ambience-loop';

/**
 * How loud the ambience plays, of the file's own level. The recording the
 * owner chose is quiet (-34 dBFS RMS, -10 dBFS peak) and the forest is meant
 * to be well forward, so it is lifted: a little over twice, to about -27 dBFS
 * RMS before `MASTER_LEVEL`. It was three times, as far as its peak allows
 * without clipping, until the owner asked for the whole mix a step quieter on
 * 2026-10-09; the three levels here came down together by the same 0.7, about
 * 3 dB, so the balance between them is as it was.
 */
export const AMBIENCE_LEVEL = 2.1;

/**
 * What the whole mix is scaled by on its way out: every effect and every loop
 * passes through it, so the balance the three levels above set is kept and
 * the one number here says how loud the game is. A fifth, about -14 dB, on
 * top of the 0.7 above: the owner played the mix after that first step and
 * found it still far too loud, then again at a half (2026-10-09). Turn this,
 * not the three, for the next step either way.
 */
export const MASTER_LEVEL = 0.2;

/**
 * How loud the one-shot effects play, of the files' own level. They are
 * generated hot, so they come down to sit in the forest rather than over it.
 */
export const EFFECT_LEVEL = 0.42;

/**
 * How loud the waterfall is at its loudest, with the wizard in the column, of
 * the file's own level. The recording is a steady roar mastered hot (-14 dBFS
 * RMS) that drowned the effects when played flat, and a third of it still sat
 * on top of the forest; at this it is a presence under the room rather than a
 * wall in front of it.
 */
export const WATERFALL_PEAK = 0.13;

/**
 * How far from the fall's edge, in world units, its sound has faded to nothing.
 * One view's width: the fall is heard from the moment it could be seen, swells
 * on the approach and dies away again once passed, by distance alone — the
 * camera's dead zone has no say in it.
 */
export const WATERFALL_RANGE = VIEW_W;

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

/** How long a loop's volume takes to settle on a new level, in seconds. */
const GLIDE_SECONDS = 0.1;

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

/** One sound that runs until it is stopped: the waterfall's, and the ambience. */
interface Loop {
  /** Ask for it, or take the ask back. */
  set(on: boolean): void;
  /** How loud, of the file's own level; it glides there rather than jumping. */
  level(gain: number): void;
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

/**
 * How loud the waterfall should be for this state, of the file's own level: at
 * `WATERFALL_PEAK` while the wizard's centre is inside the column, and falling
 * off in a straight line with his distance from the nearer edge until it is
 * gone at `WATERFALL_RANGE`. Distance alone decides, so a replay swells and
 * fades the same way every time, and leaving is arriving played backwards.
 */
export function waterfallGain(state: WorldState): number {
  const water = waterfallOf(state);

  if (water === undefined) {
    return 0;
  }

  const centre = state.player.x + PLAYER_WIDTH / 2;
  const distance = Math.max(water.x - centre, centre - (water.x + water.w), 0);

  return WATERFALL_PEAK * Math.max(1 - distance / WATERFALL_RANGE, 0);
}

export interface Audio {
  /**
   * Play what this tick's events call for, in the order they came, a repeat of
   * a sound still ringing apart (`REPEAT_GAP_TICKS`).
   */
  update(state: WorldState): void;
  /** Run the loops this frame's view calls for, which is the waterfall's, at the volume his distance calls for. */
  watch(state: WorldState, camera: Camera): void;
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

  /**
   * Start one sound now, through to its end or round again if it loops, into
   * `into`: the context's own output for an effect, a loop's gain for a loop.
   */
  function start(sound: Sound, ready: AudioContext, into: AudioNode): AudioBufferSourceNode {
    const source = ready.createBufferSource();

    source.buffer = sound.buffer;
    source.loop = sound.loop;
    source.connect(into);
    source.start();

    return source;
  }

  /** The one gain every effect plays through, made once the context exists. */
  let effectsOut: GainNode | undefined;

  function effects(ready: AudioContext): GainNode {
    if (effectsOut === undefined) {
      effectsOut = ready.createGain();
      effectsOut.gain.value = EFFECT_LEVEL * MASTER_LEVEL;
      effectsOut.connect(ready.destination);
    }

    return effectsOut;
  }

  /** Play one sound. Before the gesture there is nothing to play it with. */
  function play(name: string): void {
    const ready = context;

    if (ready !== undefined) {
      void load(name, ready).then((sound) => start(sound, ready, effects(ready)));
    }
  }

  /**
   * One sound that runs until it is asked to stop, through a gain of its own
   * that starts at `loudness`. What it was asked for is remembered whether or
   * not there is a context yet, so a loop wanted before the gesture starts
   * itself on the gesture that finally allows it, at the level last asked for.
   */
  function createLoop(name: string, loudness: number): Loop {
    let wanted = false;
    let loading = false;
    let source: AudioBufferSourceNode | undefined;
    let gain: GainNode | undefined;

    /** The loop's own volume knob, made once the context exists; `MASTER_LEVEL` is applied here. */
    function knob(ready: AudioContext): GainNode {
      if (gain === undefined) {
        gain = ready.createGain();
        gain.gain.value = loudness * MASTER_LEVEL;
        gain.connect(ready.destination);
      }

      return gain;
    }

    function level(value: number): void {
      loudness = value;

      const ready = context;

      if (ready !== undefined) {
        // A glide of a tenth of a second: a frame's worth of walking changes
        // the volume by a hair, and this keeps even that from clicking.
        knob(ready).gain.setTargetAtTime(value * MASTER_LEVEL, ready.currentTime, GLIDE_SECONDS);
      }
    }

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
          source = start(sound, ready, knob(ready));
        }
      });
    }

    return {
      set,
      level,
      /** Ask again for whatever was last asked for. */
      retry: () => set(wanted),
      running: () => wanted && (loading || source !== undefined),
    };
  }

  const loops = [createLoop(WATERFALL_SOUND, 0), createLoop(AMBIENCE_SOUND, AMBIENCE_LEVEL)] as const;
  const [waterfall, ambience] = loops;

  // The ambience is wanted from the start; like every loop it waits for the
  // gesture and starts itself on it.
  ambience.set(true);
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
      waterfall.level(waterfallGain(state));
    },

    report(): string {
      return [waterfall.running() && 'waterfall', ambience.running() && 'ambience'].filter(Boolean).join(' ');
    },
  };
}
