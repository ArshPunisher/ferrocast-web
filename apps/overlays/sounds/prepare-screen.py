#!/usr/bin/env python3
"""Prepares the sound element's sounds from real recordings (all CC0, see screen-sounds.md).

    python3 apps/overlays/sounds/prepare-screen.py <folder with the downloaded originals>

Stingers: leading silence trimmed, measured and brought to their own loudness (a tick sits
under a whoosh), peaks kept under -1 dBFS, a short fade out. (loudnorm misjudges files this
short, so the gain is worked out from ffmpeg's measurement instead.)
Loops: 30 s from the recording, brought to -24 LUFS, the 2 s after the cut faded into the start
(equal power) so the file repeats without a seam. Needs ffmpeg and numpy.
"""
import json, os, subprocess, sys, tempfile, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'design', 'sounds', 'screen')
SR = 48000
# name: (file in the download folder, kind, LUFS for a stinger or start s for a loop)
PICKS = {
    'whoosh': ('whoosh-3.mp3', 'stinger', -17),
    'riser': ('riser-3.mp3', 'stinger', -17),
    'impact': ('impact-1.mp3', 'stinger', -15),
    'tick': ('tick-1.mp3', 'stinger', -20),
    'chime': ('chime-1.mp3', 'stinger', -17),
    'glitch': ('glitch-1.mp3', 'stinger', -18),
    'rain': ('rain-1.mp3', 'loop', 20),
    'wind': ('wind-3.mp3', 'loop', 10),
    'pad': ('pad-3.mp3', 'loop', 40),
    'hum': ('hum-1.mp3', 'loop', 10),
}
LOOP, FOLD = 30.0, 2.0


def ff(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def read(path):
    with wave.open(path) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return a.reshape(-1, 2)


def write(path, a):
    a = np.clip(a, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2), w.setsampwidth(2), w.setframerate(SR)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def loudness(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    vals = [l.split()[1] for l in out.splitlines() if l.strip().startswith('I:')]
    return float(vals[-1])


def main(src):
    os.makedirs(OUT, exist_ok=True)
    lengths = {}
    with tempfile.TemporaryDirectory() as tmp:
        for name, (file, kind, start) in PICKS.items():
            raw, norm, wav = (os.path.join(tmp, f'{name}-{x}.wav') for x in ('raw', 'norm', 'out'))
            if kind == 'stinger':
                ff('-i', os.path.join(src, file), '-af', 'silenceremove=start_periods=1:start_threshold=-55dB',
                   '-ar', str(SR), '-ac', '2', norm)
                a = read(norm)
                gain = 10 ** ((start - loudness(norm)) / 20)
                peak = float(np.abs(a).max()) or 1.0
                a = a * min(gain, 0.89 / peak)
                fade = min(len(a) // 4, int(SR * 0.05))
                a[-fade:] *= np.linspace(1, 0, fade)[:, None]
            else:
                ff('-ss', str(start), '-t', str(LOOP + FOLD), '-i', os.path.join(src, file),
                   '-af', 'loudnorm=I=-24:TP=-3:LRA=11', '-ar', str(SR), '-ac', '2', norm)
                a = read(norm)
                n, f = int(SR * LOOP), int(SR * FOLD)
                k = np.linspace(0, 1, f)[:, None]
                head = a[:f] * np.sin(k * np.pi / 2) + a[n:n + f] * np.cos(k * np.pi / 2)
                a = np.concatenate([head, a[f:n]])
            write(wav, a)
            ff('-i', wav, '-codec:a', 'libmp3lame', '-q:a', '3', '-map_metadata', '-1',
               '-id3v2_version', '0', '-write_xing', '1', os.path.join(OUT, f'{name}.mp3'))
            lengths[name] = round(len(a) / SR * 1000)
            print(f'{name:8} {lengths[name]:6} ms  {os.path.getsize(os.path.join(OUT, name + ".mp3")) // 1024} KB')
    print('\nLengths for screen-sounds.ts:\n' + json.dumps(lengths))


if __name__ == '__main__':
    main(sys.argv[1])
