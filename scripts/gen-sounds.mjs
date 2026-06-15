// Synthesize the Mac app's two notification sounds and convert to .caf.
// Tasteful, short, on-brand: a bright two-note rise for "recovered", a softer
// lower tone for "needs attention". Run on macOS (uses the built-in afconvert).
//
//   node scripts/gen-sounds.mjs
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "mac", "Resources");
const SR = 44100;

// Render a sequence of notes to a Float array. Each note: sine + soft 2nd
// harmonic, fast attack, exponential decay — no clicks, gentle.
function render(notes) {
  const samples = [];
  for (const { f, dur, gain = 0.5 } of notes) {
    const n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const attack = Math.min(t / 0.008, 1);
      const decay = Math.exp(-3.2 * t / dur);
      const env = attack * decay;
      const s = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t);
      samples.push(s * env * gain);
    }
  }
  return samples;
}

function writeWav(path, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function make(name, notes) {
  const wav = join(OUT, name + ".wav");
  const caf = join(OUT, name + ".caf");
  writeWav(wav, render(notes));
  execFileSync("/usr/bin/afconvert", ["-f", "caff", "-d", "LEI16@44100", wav, caf]);
  unlinkSync(wav);
  console.log("wrote", name + ".caf");
}

// E5 -> A5: a clean rising fourth, positive and bright.
make("oo-recovered", [
  { f: 659.25, dur: 0.11 },
  { f: 880.00, dur: 0.40 },
]);

// D5 -> A4: a soft descending tone — a "notice", not an alarm.
make("oo-alert", [
  { f: 587.33, dur: 0.11, gain: 0.5 },
  { f: 440.00, dur: 0.40, gain: 0.5 },
]);

console.log("done");
