// The kit's sound: every file in `assets/audio/` copied into
// `public/assets/audio/` byte for byte, with the manifest entry the player
// reads it back by (docs/plan/03-assets/pipeline.md).
//
// A sound is not art. The image builders resample, key, cut and reduce; there
// is nothing of that kind to do to an MP3, so the file that was generated is
// the file that ships and the only work here is measuring it. The length is
// read out of the file rather than copied from assets/PROVENANCE.md, so a
// regenerated take cannot leave the manifest saying something the bytes do not
// (AGENTS.md rule 9).

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AudioEntry } from '../../game/render/sprites';

/** The folder the sounds live in, under `assets/` and under `public/assets/`. */
export const AUDIO = 'audio';

/** The one container the sounds are generated in (assets/PROVENANCE.md). */
const EXTENSION = '.mp3';

/**
 * The two sounds that repeat rather than play once
 * (docs/plan/03-assets/prompts/audio.md): the waterfall under the rock face,
 * and the music behind the settings toggle. Every other file is one event's
 * worth of sound and ends by itself. This is the one place that decides;
 * game/render/audio.ts reads the flag back off the manifest rather than
 * keeping a list of its own (AGENTS.md rule 9).
 */
const LOOPS: readonly string[] = ['waterfall-loop', 'music-loop'];

/** One sound the kit copied: where it went, and what the manifest says of it. */
export interface Sound {
  /** The manifest name, `audio/<basename>`. */
  name: string;
  /** The file, the same path under `assets/` and under `public/assets/`. */
  file: string;
  entry: AudioEntry;
}

/**
 * Copy every sound of `raws` into `out` and measure it. The names come back in
 * the order the folder lists them, which is alphabetical, so two builds of the
 * same `assets/` write the same manifest.
 */
export async function copyAudio(raws: string, out: string): Promise<Sound[]> {
  const files = (await readdir(join(raws, AUDIO))).filter((file) => file.endsWith(EXTENSION)).sort();
  const sounds: Sound[] = [];

  await mkdir(join(out, AUDIO), { recursive: true });

  for (const file of files) {
    const path = join(AUDIO, file);
    const basename = file.slice(0, -EXTENSION.length);
    // The bytes are read once and written back unchanged, which is both the
    // copy and the measurement; there is nothing else to do to a sound.
    const bytes = await readFile(join(raws, path));
    const entry: AudioEntry = {
      kind: 'audio',
      seconds: mp3Seconds(bytes, path),
      loop: LOOPS.includes(basename),
    };

    await writeFile(join(out, path), bytes);
    process.stdout.write(`${AUDIO}/${basename} ${entry.seconds.toFixed(1)}s${entry.loop ? ' loop' : ''}\n`);
    sounds.push({ name: `${AUDIO}/${basename}`, file: path, entry });
  }

  return sounds;
}

/** Bit rates of MPEG-1 Layer III, in kbit per second, by the header's index. */
const BIT_RATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

/** Sample rates of MPEG-1, in samples per second, by the header's index. */
const SAMPLE_RATES = [44_100, 48_000, 32_000, 0];

/** Samples one MPEG-1 Layer III frame carries; every frame carries the same. */
const FRAME_SAMPLES = 1152;

/** A frame header's own length, which is what a scan steps over to look again. */
const HEADER = 4;

/**
 * How long an MP3 plays, in seconds, rounded to the millisecond: every audio
 * frame it holds, timed by the rate its own header gives and added up. Summing
 * frames rather than dividing the file's size by a bit rate is what makes the
 * answer right for the 192 kbit music as well as the 128 kbit effects, and
 * would stay right for a variable-rate file.
 */
export function mp3Seconds(bytes: Uint8Array, name: string): number {
  let at = afterTag(bytes);
  let samples = 0;

  while (at + HEADER <= bytes.length) {
    const frame = frameAt(bytes, at);

    // Not a frame: a tag, padding or the file's own trailer. Step a byte and
    // look again, which is how a scan finds the first frame after either.
    if (frame === undefined) {
      at += 1;
      continue;
    }

    samples += FRAME_SAMPLES / frame.rate;
    at += frame.length;
  }

  if (samples === 0) {
    throw new Error(`${name} holds no MPEG audio frames: it is not the MP3 the kit copies`);
  }

  return Math.round(samples * 1000) / 1000;
}

/** How far into the file the audio can start: past an ID3 tag, or at zero. */
function afterTag(bytes: Uint8Array): number {
  const flags = bytes[5];

  if (flags === undefined || String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3') {
    return 0;
  }

  // The tag's length is four seven-bit groups, the high bit of each byte left
  // clear so the length can never look like a frame header itself.
  const size = [6, 7, 8, 9].reduce((total, index) => (total << 7) | (bytes[index] ?? 0), 0);
  const footer = (flags & 0x10) === 0 ? 0 : 10;

  return 10 + size + footer;
}

/** The frame starting here, by its four-byte header, or nothing if none does. */
function frameAt(bytes: Uint8Array, at: number): { length: number; rate: number } | undefined {
  const [first, second, third] = [bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0];
  // Eleven set bits, then MPEG-1 (3) and Layer III (1); nothing else is a
  // frame of the kind the generator writes.
  const framed = first === 0xff && (second & 0xe0) === 0xe0;
  const version = (second >> 3) & 0b11;
  const layer = (second >> 1) & 0b11;
  const bitRate = (BIT_RATES[(third >> 4) & 0b1111] ?? 0) * 1000;
  const rate = SAMPLE_RATES[(third >> 2) & 0b11] ?? 0;
  const padding = (third >> 1) & 0b1;

  if (!framed || version !== 3 || layer !== 1 || bitRate === 0 || rate === 0) {
    return undefined;
  }

  return { length: Math.floor((FRAME_SAMPLES / 8) * (bitRate / rate)) + padding, rate };
}
