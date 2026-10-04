# Checks a rendered video for jank: a frame frozen mid-motion (dropped or late) or a frame
# that jumps far more than its neighbours. Cuts are not counted.
#   python3 scripts/promo/smooth.py <ffmpeg> scripts/promo/out/promo.mp4
# Sprite effects that step at ~15 fps (portals, sparks) can show as "frozen" on a still camera:
# look at those frames before calling it a render bug.
import subprocess, sys, re, statistics
F, path = sys.argv[1], sys.argv[2]
out = subprocess.run([F, '-i', path, '-vf', 'scale=270:-1,signalstats,metadata=print:key=lavfi.signalstats.YDIF', '-f', 'null', '-'], capture_output=True, text=True).stderr
d = [float(x) for x in re.findall(r'YDIF=([\d.]+)', out)]
frozen, jumps = [], []
for i in range(2, len(d) - 2):
    a, b, c = d[i - 1], d[i], d[i + 1]
    # A frame that did not change while the frames around it move: a dropped/late frame.
    if a > 0.8 and c > 0.8 and b < 0.15 * min(a, c): frozen.append(i)
    # A frame that changes far more than both neighbours (not a cut: cuts are > 12).
    if b < 12 and a > 0.3 and c > 0.3 and b > 5 * max(a, c) and b > 2.5: jumps.append(i)
print(f"{path.split('/')[-1]}: {len(d)} frames, frozen mid-motion {len(frozen)} {[round(i/30,2) for i in frozen][:8]}, jumps {len(jumps)} {[round(i/30,2) for i in jumps][:8]}")
