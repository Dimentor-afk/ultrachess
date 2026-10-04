# Sound track for an ad rendered by render.mjs: a 128 BPM track cut to the
# shots, and sound effects placed on the marks the renderer recorded.
#   pip install numpy scipy
#   python3 scripts/promo/sound.py scripts/promo/out/promo.marks.json <video seconds> out.wav [--bpm 128] [--key minor|pop|dark] [--no-music]
#   ffmpeg -i scripts/promo/out/promo.mp4 -i out.wav -c:v copy -c:a aac -b:a 192k -shortest promo-sound.mp4
import json
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 48000

def _arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default

BPM = float(_arg('--bpm', 128))
KEY = _arg('--key', 'minor')
BEAT = 60 / BPM
rng = np.random.default_rng(7)

marks = json.load(open(sys.argv[1]))
LENGTH = float(sys.argv[2])
OUT = sys.argv[3]
MUSIC = '--no-music' not in sys.argv
N = int((LENGTH + 0.05) * SR)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))


def t_(n):
    return np.arange(n) / SR


def env(n, a=0.002, d=0.2, curve=4.0):
    """Attack then exponential decay over n samples (d: decay time in s)."""
    t = t_(n)
    e = np.exp(-t / max(d, 1e-4) * (curve / 4))
    att = int(a * SR)
    if att > 0:
        e[:att] *= np.linspace(0, 1, att)
    return e


def put(buf, at, sig, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if sig.ndim == 1:
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        sig = np.stack([sig * l, sig * r], 1) * 1.414
    s0 = max(0, -i)
    i0 = max(0, i)
    n = min(len(sig) - s0, N - i0)
    buf[i0 : i0 + n] += sig[s0 : s0 + n] * gain


def lowpass(x, cutoff):
    """One-pole low-pass, run twice (12 dB/oct); cutoff may be an array (a sweep, applied per block)."""
    c = np.asarray(cutoff, dtype=float)
    out = np.empty_like(x)
    for _ in range(2):
        zi = np.zeros(1)
        B = 256 if c.ndim else len(x)
        for i in range(0, len(x), B):
            cc = float(c[min(i, len(c) - 1)]) if c.ndim else float(c)
            a = np.exp(-2 * np.pi * min(cc, SR * 0.45) / SR)
            out[i : i + B], zi = lfilter([1 - a], [1, -a], x[i : i + B], zi=zi)
        x = out.copy()
    return out


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def noise(n):
    return rng.uniform(-1, 1, n)


def saw(freq, n, detune=0.0):
    t = t_(n)
    f = freq * (1 + detune)
    return 2 * ((t * f) % 1) - 1


def note(name):
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = names[name[0]] + (1 if '#' in name else 0)
    octave = int(name[-1])
    return 440 * 2 ** ((n + 12 * (octave - 4)) / 12)


# ── Instruments ──


def kick():
    n = int(0.42 * SR)
    t = t_(n)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env(n, 0.001, 0.32)
    click = highpass(noise(n), 3000) * env(n, 0.0005, 0.006)
    return np.tanh(1.6 * body) * 0.95 + click * 0.25


def clap():
    n = int(0.3 * SR)
    x = np.zeros(n)
    for k, off in enumerate([0, 0.009, 0.018, 0.027]):
        i = int(off * SR)
        m = n - i
        x[i:] += noise(m) * env(m, 0.0005, 0.05 if k < 3 else 0.16)
    x = highpass(lowpass(x, 5500), 900)
    tone = np.sin(2 * np.pi * 190 * t_(n)) * env(n, 0.001, 0.05) * 0.4
    return (x * 1.2 + tone) * 0.8


def hat(open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    x = highpass(noise(n), 7000) * env(n, 0.0005, 0.12 if open_ else 0.022)
    return x * 0.5


def crash():
    n = int(2.2 * SR)
    x = highpass(noise(n), 4500) * env(n, 0.002, 0.9)
    return x * 0.55


def bass_note(freq, dur):
    n = int(dur * SR)
    x = saw(freq, n) + saw(freq, n, 0.006) * 0.7 + np.sin(2 * np.pi * freq / 2 * t_(n)) * 0.9
    x = lowpass(x, 380 + 900 * env(n, 0.002, 0.08)) * env(n, 0.004, dur * 1.2)
    return np.tanh(x * 1.4) * 0.55


def pluck(freq, dur=0.32):
    n = int(dur * SR)
    x = saw(freq, n) * 0.6 + saw(freq * 2, n, 0.003) * 0.25 + np.sin(2 * np.pi * freq * t_(n)) * 0.4
    x = lowpass(x, 900 + 5000 * env(n, 0.001, 0.07)) * env(n, 0.002, 0.13)
    return x * 0.32


def pad(freqs, dur):
    n = int(dur * SR)
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.004, 0.0, 0.005):
            x += saw(f, n, d)
    x = lowpass(x / (3 * len(freqs)), 1400)
    a = np.minimum(1, t_(n) / 0.25) * np.minimum(1, (dur - t_(n)) / 0.3)
    return x * a * 0.5


def riser(dur):
    n = int(dur * SR)
    t = t_(n) / dur
    x = noise(n)
    x = highpass(lowpass(x, 600 + 9000 * t**2), 300 + 2000 * t)
    f = 200 + 1400 * t**2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (x + tone) * (t**1.6) * 0.6


def impact():
    n = int(2.6 * SR)
    t = t_(n)
    f = 30 + 90 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 1.1)
    hit = lowpass(noise(n), 2500) * env(n, 0.001, 0.12)
    return np.tanh(1.8 * sub) * 0.9 + hit * 0.5


def whoosh(dur=0.42, up=True):
    n = int(dur * SR)
    t = t_(n) / dur
    shape = np.sin(np.pi * t) ** 2
    cut = 500 + 6000 * (t if up else 1 - t)
    x = lowpass(noise(n), cut) - lowpass(noise(n), 250)
    return x * shape * 0.7


def hit():
    """A piece taken: thump plus a crack."""
    n = int(0.5 * SR)
    t = t_(n)
    f = 70 + 160 * np.exp(-t / 0.03)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.16)
    crack = highpass(noise(n), 1800) * env(n, 0.0005, 0.035)
    return np.tanh(2 * thump) * 0.8 + crack * 0.55


def tick():
    """A piece set down."""
    n = int(0.12 * SR)
    x = lowpass(highpass(noise(n), 800), 4000) * env(n, 0.0005, 0.018)
    knock = np.sin(2 * np.pi * 320 * t_(n)) * env(n, 0.001, 0.03)
    return x * 0.4 + knock * 0.3


def shimmer(base, dur=1.2, up=True, steps=7):
    n = int(dur * SR)
    x = np.zeros(n)
    iv = [0, 4, 7, 12, 16, 19, 24, 28][:steps]
    for k in range(steps):
        f = base * 2 ** ((iv[k] if up else iv[steps - 1 - k]) / 12)
        i = int(k * dur / steps * 0.6 * SR)
        m = n - i
        x[i:] += np.sin(2 * np.pi * f * t_(m)) * env(m, 0.002, 0.35) * (0.6 + 0.4 * np.sin(2 * np.pi * 5 * t_(m)))
    return x * 0.18


def portal():
    n = int(1.1 * SR)
    t = t_(n)
    f = 900 * np.exp(-t / 0.35) + 110
    ph = 2 * np.pi * np.cumsum(f) / SR
    wob = np.sin(ph) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t))
    air = lowpass(noise(n), 1500 + 3000 * np.exp(-t / 0.3)) * 0.4
    return (wob * 0.5 + air) * env(n, 0.02, 0.5)


def rumble(dur=1.4):
    n = int(dur * SR)
    t = t_(n)
    x = lowpass(noise(n), 140) * 3.0 + lowpass(noise(n), 700) * 0.4
    a = np.minimum(1, t / 0.05) * np.exp(-t / (dur * 0.5))
    return np.tanh(x * a * 1.5) * 0.9


def boom():
    n = int(1.8 * SR)
    t = t_(n)
    body = lowpass(noise(n), 400 + 3000 * np.exp(-t / 0.05)) * env(n, 0.001, 0.5) * 2
    f = 40 + 70 * np.exp(-t / 0.1)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.7)
    return np.tanh(body + sub * 1.2) * 0.9


def pop():
    n = int(0.6 * SR)
    t = t_(n)
    crackle = highpass(noise(n), 3000) * (rng.uniform(0, 1, n) > 0.985) * env(n, 0.01, 0.25) * 3
    bang = lowpass(noise(n), 1800) * env(n, 0.001, 0.05)
    return (crackle + bang) * 0.45


def ding(f=1320, dur=0.8):
    n = int(dur * SR)
    t = t_(n)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * env(n, 0.001, 0.08)
    return x * env(n, 0.001, 0.35) * 0.22


def rattle(dur):
    n = int(dur * SR)
    x = np.zeros(n)
    k = 0.0
    while k < dur:
        i = int(k * SR)
        m = min(int(0.05 * SR), n - i)
        x[i : i + m] += lowpass(highpass(noise(m), 1200), 5000) * env(m, 0.0005, 0.012)
        k += 0.045 + 0.02 * rng.random()
    return x * 0.5


# ── Arrangement ──
# Every shot says what the music does under it (data-music on the shot, in the cut mark):
#   full  — the whole beat;  tense — a soft pulse (a countdown);  build — no drums, a riser into
#   the drop;  end — the last chord. A tense or build shot turns full at its drop (the S tier
#   card, the puzzle answer, the pack's last card turning over).
cuts = sorted([m for m in marks if m['k'] == 'cut'], key=lambda m: m['t'])
shots = [(m['t'] / 1000, m.get('m', 'full')) for m in cuts]
if shots and all(m.get('m') is None for m in cuts) and len(shots) > 4:
    shots[4] = (shots[4][0], 'build')  # marks from before the music modes: the promo's pack shot
    shots[-1] = (shots[-1][0], 'end')
bounds = [t for t, _ in shots] + [LENGTH]
drops = sorted(
    [m['t'] / 1000 for m in marks if m['k'] in ('drop', 'reveal')]
    + [m['t'] / 1000 for m in marks if m['k'] == 'flip' and 'flipped' in m.get('c', '')]
)
# A build shot without a drop inside ends in one: on the next cut.
for i, (t0, mode) in enumerate(shots):
    if mode == 'build' and not any(t0 <= d < bounds[i + 1] for d in drops):
        drops.append(bounds[i + 1])
drops.sort()
flips = [m for m in marks if m['k'] == 'flip']


def shot_at(t):
    for i, (t0, mode) in enumerate(shots):
        if t0 - 0.03 <= t < bounds[i + 1] - 0.03:
            return i, t0, mode
    return len(shots) - 1, shots[-1][0], shots[-1][1]


def mode_at(t):
    i, t0, mode = shot_at(t)
    if mode in ('tense', 'build') and any(t0 <= d <= t + 0.03 for d in drops if d < bounds[i + 1]):
        return 'full'
    return mode


KEYS = {
    'minor': [['A2', 'A3', 'C4', 'E4'], ['F2', 'F3', 'A3', 'C4'], ['C3', 'G3', 'C4', 'E4'], ['G2', 'G3', 'B3', 'D4']],
    'pop': [['C3', 'C4', 'E4', 'G4'], ['G2', 'G3', 'B3', 'D4'], ['A2', 'A3', 'C4', 'E4'], ['F2', 'F3', 'A3', 'C4']],
    'dark': [['D3', 'D4', 'F4', 'A4'], ['A#2', 'A#3', 'D4', 'F4'], ['F2', 'F3', 'A3', 'C4'], ['C3', 'G3', 'C4', 'E4']],
}
CHORDS = KEYS[KEY]
side = np.ones(N)  # sidechain gain from the kick
first_drop = drops[0] if drops else 1e9

if MUSIC:
    beats = int(LENGTH / BEAT) + 2
    for b in range(beats):
        tb = b * BEAT
        if tb >= LENGTH:
            break
        ch = CHORDS[(b // 4) % 4]
        mode = mode_at(tb)
        if mode == 'full':
            put(music, tb, kick(), 0.95)
            i = int(tb * SR)
            m = min(int(0.28 * SR), N - i)
            if m > 0:
                side[i : i + m] = np.minimum(side[i : i + m], 0.35 + 0.65 * (np.arange(m) / m) ** 0.7)
            if b % 2 == 1:
                put(music, tb, clap(), 0.55)
            sub = 4 if tb >= first_drop else 2
            for h in range(sub):
                put(music, tb + h * BEAT / sub, hat(), 0.32 if h % 2 else 0.45, pan=0.25)
            put(music, tb + BEAT / 2, hat(open_=True), 0.28, pan=-0.2)
            put(music, tb + BEAT / 2, bass_note(note(ch[0]), BEAT / 2 * 0.95), 0.9)
            arp = [ch[1], ch[2], ch[3], ch[2]]
            for k in range(4):
                f = note(arp[k]) * 2
                put(music, tb + k * BEAT / 4, pluck(f), 0.55, pan=(-0.35 if k % 2 else 0.35))
                put(music, tb + k * BEAT / 4 + BEAT * 0.75, pluck(f) * 0.35, 0.5, pan=(0.5 if k % 2 else -0.5))
        elif mode == 'tense':
            # A heartbeat and a low pulse: room for the countdown ticks.
            if b % 2 == 0:
                put(music, tb, kick() * 0.6, 0.7)
                put(music, tb + BEAT * 0.28, kick() * 0.35, 0.5)
            put(music, tb, bass_note(note(ch[0]) / 2 * 2, BEAT * 0.9), 0.55)
            put(music, tb + BEAT / 2, hat(), 0.18, pan=0.3)
        if b % 4 == 0 and mode != 'end':
            put(music, tb, pad([note(x) for x in ch[1:]], 4 * BEAT), 0.5 if mode in ('build', 'tense') else 0.3)
    # Builds: a riser from the shot's start into its drop, a snare roll on the last two beats.
    for i, (t0, mode) in enumerate(shots):
        if mode != 'build':
            continue
        d = next(x for x in drops if x >= t0)
        put(music, t0 + 0.1, riser(max(0.3, d - t0 - 0.1)), 0.75)
        k = 0
        while d - 2 * BEAT + k * BEAT / 8 < d - 0.01:
            put(music, d - 2 * BEAT + k * BEAT / 8, clap(), 0.18 + 0.4 * k / 16)
            k += 1
    for d in drops:
        put(music, d, crash(), 0.8)
        put(music, d, impact(), 1.0)
    # Every other cut lands on a crash, softer than a drop.
    for i, (t0, mode) in enumerate(shots):
        if i and mode == 'full' and not any(abs(t0 - d) < 0.1 for d in drops):
            put(music, t0, crash(), 0.3)
        if mode == 'end':
            put(music, t0, pad([note(x) for x in CHORDS[0][1:]] + [note(CHORDS[0][1]) * 2], LENGTH - t0), 0.7)
            put(music, t0, kick(), 1.0)
            put(music, t0, crash(), 0.6)
            put(music, t0, bass_note(note(CHORDS[0][0]), 1.2), 0.9)
    music *= side[:, None]

# ── Effects on the marks ──
SFX = {
    'capture': (hit, 0.9),
    'portal': (portal, 0.75),
    'quake': (lambda: rumble(1.6), 0.0),  # once per quake, below
    'boom': (boom, 1.0),
    'explode': (hit, 0.6),
    'mirage': (lambda: shimmer(660, 1.4), 1.0),
    'absorb': (lambda: shimmer(990, 0.8, up=False), 0.9),
    'revive': (lambda: shimmer(523, 1.6), 1.2),
    'immortal': (lambda: shimmer(784, 1.0), 0.8),
    'twinkle': (lambda: ding(2093, 0.5), 0.5),
    'sparkle': (lambda: ding(1760, 0.5), 0.4),
    'impact': (hit, 0.8),
    'puff': (lambda: whoosh(0.25, up=False), 0.4),
    'check': (lambda: ding(1320, 0.9), 0.7),
    'win': (pop, 0.5),
    'firework': (pop, 0.7),
    'dust': (None, 0),
    'cap_epic': (lambda: shimmer(880, 1.6), 0.9),
    'burst': (lambda: shimmer(1046, 0.9), 0.6),
}
quake_done = set()
# One sound per kind and moment: seven illusions appearing at once are one shimmer.
_seen = set()
_uniq = []
for m in marks:
    key = (m['k'], round(m['t'] / 60), m.get('c'))
    if key in _seen:
        continue
    _seen.add(key)
    _uniq.append(m)
marks = _uniq
for m in marks:
    k, t = m['k'], m['t'] / 1000
    if k == 'move':
        put(sfx, t, tick(), 0.5)
        continue
    if k == 'cut' and m['n'] > 0:
        put(sfx, t - 0.22, whoosh(0.45), 0.55)
        continue
    if k == 'count':
        # A clock tick with a low hit under it: 3, 2, 1.
        put(sfx, t, tick() * 2.2, 0.9)
        put(sfx, t, ding(880, 0.3), 0.6)
        put(sfx, t, kick() * 0.5, 0.5)
        continue
    if k == 'slam':
        put(sfx, t, whoosh(0.3, up=False), 0.5)
        put(sfx, t + 0.28, hit(), 0.9)
        continue
    if k in ('drop', 'reveal'):
        continue
    if k == 'cap':
        put(sfx, t, ding(2637, 0.25), 0.12)
        continue
    if k == 'pack':
        if 'opening' in m['c'] and 'idle' not in m['c']:
            put(sfx, t, rattle(0.6), 0.8)
        if 'burst' in m['c']:
            put(sfx, t, boom(), 0.6)
            put(sfx, t, shimmer(1046, 1.2), 1.0)
        continue
    if k == 'flip':
        c = m['c']
        if 'stage-tease' in c:
            put(sfx, t, ding(440 * 2 ** (len([x for x in flips if x['t'] <= m['t'] and 'stage-tease' in x['c']]) / 3), 0.5), 0.9)
        elif 'stage-spin' in c:
            put(sfx, t, whoosh(0.45), 0.8)
        continue
    if k.startswith('cap_') and k != 'cap_epic':
        put(sfx, t, hit(), 0.9)
        continue
    if k == 'quake':
        key = round(t, 0)
        if key not in quake_done:
            quake_done.add(key)
            put(sfx, t, rumble(1.6), 0.9)
        continue
    fn, g = SFX.get(k, (None, 0))
    if fn and g:
        put(sfx, t, fn(), g)

# ── Mix and master ──
mix = music * 0.7 + sfx * 0.9
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
fade = int(0.6 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
peak = np.max(np.abs(mix)) or 1
mix = mix / peak * 0.72  # about -13 LUFS: TikTok turns louder tracks down anyway
pcm = (mix * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(OUT, f'{LENGTH:.1f}s', 'drops at', [round(d, 2) for d in drops], 'shots', [m for _, m in shots])
