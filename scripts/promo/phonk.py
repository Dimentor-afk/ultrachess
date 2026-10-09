# A drift phonk track for the edits, synthesised here (no samples, nothing to license):
# a muffled cowbell riff with a riser for the intro, then on the drop the cowbell in full,
# a distorted 808, claps and hats with rolls. Bar-exact, so the edit can be cut to its grid.
#   python3 scripts/promo/phonk.py out.wav [--bpm 130] [--intro 3] [--drop 5] [--tail 0.8]
# Prints when the drop lands and the beat length, in ms.
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 48000


def _arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
BPM = float(_arg('--bpm', 130))
INTRO = int(_arg('--intro', 3))
DROP = int(_arg('--drop', 5))
TAIL = float(_arg('--tail', 0.8))
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
DROP_AT = INTRO * BAR
LENGTH = DROP_AT + DROP * BAR + TAIL
N = int(LENGTH * SR) + SR
rng = np.random.default_rng(11)

mix = np.zeros((N, 2))


def t_(n):
    return np.arange(n) / SR


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def put(at, sig, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.sqrt(0.5 * (1 - pan)) * 1.414, np.sqrt(0.5 * (1 + pan)) * 1.414
    mix[i : i + len(sig), 0] += sig * gain * l
    mix[i : i + len(sig), 1] += sig * gain * r


def cowbell(freq, dur=0.26):
    """The 808 cowbell: two square waves a fifth-ish apart, band-passed, a fast decay."""
    n = int(dur * SR)
    t = t_(n)
    s = np.sign(np.sin(2 * np.pi * freq * t)) + 0.8 * np.sign(np.sin(2 * np.pi * freq * 1.4836 * t))
    s = highpass(lowpass(s, 5200), 420)
    e = np.exp(-t / 0.075) * 0.85 + np.exp(-t / 0.4) * 0.15
    e[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return np.tanh(s * e * 1.6) * 0.6


def kick808(freq, dur=0.55):
    """A punchy 808: the pitch falls onto the note, long body, driven hard."""
    n = int(dur * SR)
    t = t_(n)
    f = freq + (165 - freq) * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / (dur * 0.55))
    click = rng.standard_normal(n) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 3.2) * 0.75


def clap():
    n = int(0.28 * SR)
    t = t_(n)
    x = highpass(lowpass(rng.standard_normal(n), 3800), 900)
    e = np.zeros(n)
    for k, off in enumerate((0, 0.011, 0.022)):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) / (0.018 if k < 2 else 0.12))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.4
    return np.tanh((x * e + tone) * 1.8) * 0.55


def hat(open_=False):
    n = int((0.22 if open_ else 0.045) * SR)
    t = t_(n)
    x = highpass(rng.standard_normal(n), 7000)
    return x * np.exp(-t / (0.07 if open_ else 0.012)) * 0.32


def riser(dur):
    n = int(dur * SR)
    t = t_(n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    # The noise opens up as it climbs.
    seg = 12
    for k in range(seg):
        a, b = k * n // seg, (k + 1) * n // seg
        out[a:b] = lowpass(x[a:b], 600 + 9000 * (k / seg) ** 2)
    sweep = np.sin(2 * np.pi * np.cumsum(220 + 900 * (t / dur) ** 2) / SR) * 0.15
    return (out + sweep) * (t / dur) ** 2 * 0.5


def impact():
    n = int(1.4 * SR)
    t = t_(n)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 90 * np.exp(-t / 0.06)) / SR) * np.exp(-t / 0.5)
    crash = highpass(rng.standard_normal(n), 3000) * np.exp(-t / 0.45) * 0.35
    return np.tanh((boom * 1.4 + crash) * 1.5) * 0.8


# The riff (semitones over D5), two bars of 16 steps; None = rest. Quieter ghost notes in between.
D5 = 587.33
RIFF = [
    [0, None, 0, None, 3, None, 0, None, 7, None, 5, None, 3, None, 2, None],
    [0, None, 0, None, 3, None, 0, None, 10, None, 8, None, 7, None, 5, None],
]
GHOST = {1: 0, 9: 7}
ROOTS = [0, 0, 3, -2]  # the 808 follows the riff, one root a bar
KICKS = [0, 6, 10]
KICKS_ALT = [0, 3, 6, 10, 14]

cow = np.zeros(N)
for bar in range(INTRO + DROP):
    t0 = bar * BAR
    riff = RIFF[bar % 2]
    for k, semi in enumerate(riff):
        if semi is not None:
            s = cowbell(D5 * 2 ** (semi / 12))
            i = int((t0 + k * STEP) * SR)
            cow[i : i + len(s)] += s[: N - i]
        if k in GHOST and bar >= INTRO:
            s = cowbell(D5 * 2 ** (GHOST[k] / 12)) * 0.35
            i = int((t0 + k * STEP) * SR)
            cow[i : i + len(s)] += s[: N - i]

# Intro: the cowbell through a closed filter (as if from the next room), opening a little; drop: in full.
d = int(DROP_AT * SR)
intro = cow[:d]
muffled = lowpass(lowpass(intro, 900), 1400) * 1.6
muffled *= np.linspace(0.6, 1.0, len(muffled))
cow_out = np.concatenate([muffled, cow[d:]])
mix[:, 0] += cow_out * 0.55
mix[:, 1] += np.roll(cow_out, int(0.012 * SR)) * 0.55  # a little width

# The last intro bar: a riser, then a beat of silence before the drop.
put(DROP_AT - BAR, riser(BAR - BEAT * 0.5), 0.9)
for k in range(8):
    put(DROP_AT - BEAT + k * BEAT / 8 - BEAT, clap() * (0.2 + 0.1 * k), 0.6)
put(DROP_AT, impact(), 1.0)

for bar in range(DROP):
    t0 = DROP_AT + bar * BAR
    root = 73.42 * 2 ** (ROOTS[bar % 4] / 12)
    for k in (KICKS_ALT if bar % 2 else KICKS):
        dur = 0.5 if k in (0, 10) else 0.3
        put(t0 + k * STEP, kick808(root, dur), 1.0)
    for k in (4, 12):
        put(t0 + k * STEP, clap(), 0.9)
    for k in range(0, 16, 2):
        if bar % 2 and k == 14:
            for j in range(4):  # a roll into the next bar
                put(t0 + (14 + j * 0.5) * STEP, hat(), 0.8 + 0.1 * j, pan=0.2)
        else:
            put(t0 + k * STEP, hat(open_=(k == 6)), 0.9, pan=0.2)
# The end: one last 808 and the cowbell ringing out.
end = DROP_AT + DROP * BAR
put(end, kick808(73.42, 0.9), 1.0)
put(end, cowbell(D5, 0.8), 0.6)

# Master: glue, loud but not clipped, a short fade.
out = mix[: int(LENGTH * SR)]
out = np.tanh(out * 1.3) / np.tanh(1.3)
fade = int(0.5 * SR)
out[-fade:] *= np.linspace(1, 0, fade)[:, None]
out = out / (np.max(np.abs(out)) or 1) * 0.89
pcm = (out * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{OUT}: {LENGTH:.2f} s, {BPM:g} BPM, beat {BEAT * 1000:.1f} ms, drop at {DROP_AT * 1000:.0f} ms, ends {(DROP_AT + DROP * BAR) * 1000:.0f} ms')
