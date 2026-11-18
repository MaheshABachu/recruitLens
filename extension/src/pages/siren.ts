// Offscreen document that plays the escape siren. The background worker can't
// play audio itself, and the BAD window can be closed/reopened, so the siren
// lives here: it starts as soon as the document loads and stops when the
// worker closes the document (see startSiren/stopSiren in background/focus.ts).
// Synthesized with Web Audio, so there's no sound file to ship.

const ctx = new AudioContext();

// Classic "wail": a sawtooth whose pitch sweeps up and down via a slow LFO.
const osc = ctx.createOscillator();
osc.type = "sawtooth";
osc.frequency.value = 900;

const lfo = ctx.createOscillator();
lfo.type = "triangle";
lfo.frequency.value = 0.6; // one up-and-down sweep every ~1.7 s
const depth = ctx.createGain();
depth.gain.value = 350; // 550 Hz to 1250 Hz
lfo.connect(depth).connect(osc.frequency);

// Take the edge off the raw sawtooth so it's loud, not painful.
const filter = ctx.createBiquadFilter();
filter.type = "lowpass";
filter.frequency.value = 2500;

const volume = ctx.createGain();
volume.gain.value = 0;
volume.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.15);

osc.connect(filter).connect(volume).connect(ctx.destination);
osc.start();
lfo.start();
void ctx.resume();
