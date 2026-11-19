"""Détourage stable d'une vidéo de gâteau sur fond blanc.

usage : python detoure-video.py source.mp4 sortie.mp4 affiche.webp LARGEUR HAUTEUR [PLAFOND] [R]

Prérequis (environnement isolé conseillé) : pip install "rembg[cpu]" ; ffmpeg dans le PATH.
Source : la vidéo d'origine (medias-non-publies/originaux), pas une version déjà détourée.
Réglages utilisés le 2026-11-19 (vidéos 464×848) :
  mangue-passion 642 840 · framboises 680 882 · caramel-18 786 872 · anniversaire-33 798 956 280
IS-Net détoure chaque image, puis médiane temporelle (bords stables) et nettoyage des joints
de carrelage ; le plateau tournant blanc est gardé comme présentoir.
"""
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove

src, out_mp4, out_poster, TW, TH = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
W, H = 464, 848
RAYON_TEMPS = 3  # ±3 images (0,1 s) : les bords ne tremblent plus, le gâteau qui tourne reste net
MARGE = 0.08
# Facultatif : rien au-dessus de cette ligne (joints de carrelage qui prolongent un décor).
PLAFOND = int(sys.argv[6]) if len(sys.argv) > 6 else 0
R = int(sys.argv[7]) if len(sys.argv) > 7 else 2  # demi-hauteur de l’ouverture verticale

raw = subprocess.run(
    ['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    capture_output=True, check=True,
).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
n = len(frames)
session = new_session('isnet-general-use')

alphas = np.empty((n, H, W), np.uint8)
for i, f in enumerate(frames):
    alphas[i] = np.asarray(remove(Image.fromarray(f), session=session, only_mask=True))
    if i % 50 == 0:
        print(f'{i}/{n}', flush=True)

# Lissage temporel : médiane glissante de l'alpha.
lisse = np.empty_like(alphas)
for i in range(n):
    a, b = max(0, i - RAYON_TEMPS), min(n, i + RAYON_TEMPS + 1)
    lisse[i] = np.median(alphas[a:b], axis=0)

# Silhouette permanente (présente dans plus de 60 % des images), élargie de ~12 px.
presence = (lisse > 128).mean(axis=0)
coeur = Image.fromarray(((presence > 0.6) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(25))
coeur = np.asarray(coeur) > 0

# Hors de la silhouette : ouverture 5×5, qui efface les joints de carrelage (1–2 px de large).
final = np.empty_like(lisse)
for i in range(n):
    img = Image.fromarray(lisse[i])
    ouvert = np.asarray(img.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5)))
    # Ouverture verticale 1×5 : efface les traits horizontaux fins (joints) ; la tige d'un décor,
    # verticale, reste.
    l = lisse[i]
    pad5 = np.pad(l, ((R, R), (0, 0)), mode='edge')
    ero = np.min([pad5[k:k + H] for k in range(2 * R + 1)], axis=0)
    pad5 = np.pad(ero, ((R, R), (0, 0)), mode='edge')
    ouvert_v = np.max([pad5[k:k + H] for k in range(2 * R + 1)], axis=0)
    a = np.where(coeur, l, np.minimum(np.minimum(l, ouvert), ouvert_v)).astype(np.float32)
    if PLAFOND:
        a[:PLAFOND] = 0
        # Un joint de carrelage en biais traverse le décor (lignes PLAFOND–352) : on ne garde
        # que les colonnes où le décor existe juste en dessous (sa tige, lignes 352–384).
        cols = np.nonzero((a[352:384] > 128).any(axis=0))[0]
        if len(cols):
            garde = np.zeros(W, bool)
            garde[max(0, cols.min() - 10):cols.max() + 11] = True
            bande = a[PLAFOND:352]
            bande[:, ~garde & ~coeur[PLAFOND:352].any(axis=0)] = 0
    # Courbe à seuil : les fuites faibles (joints de carrelage, alpha < 24) tombent à zéro.
    final[i] = np.clip((a - 24) * 255 / (255 - 48), 0, 255).astype(np.uint8)

# Cadrage : boîte englobante de ce qui apparaît dans au moins 1 % des images, + marge.
union = (final > 128).mean(axis=0) > 0.01
ys, xs = np.nonzero(union)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
cw, ch = (x1 - x0) * (1 + 2 * MARGE), (y1 - y0) * (1 + 2 * MARGE)
ratio = TW / TH
if cw / ch < ratio:
    cw = ch * ratio
else:
    ch = cw / ratio
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
pad = int(max(cw, ch))  # toile blanche autour pour que le cadre ne sorte jamais de l'image
left, top = int(round(cx - cw / 2)) + pad, int(round(cy - ch / 2)) + pad
cw, ch = int(round(cw)), int(round(ch))
print('cadre', left - pad, top - pad, cw, ch, flush=True)

enc = subprocess.Popen(
    ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{TW}x{TH}', '-r', '30',
     '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
     '-profile:v', 'high', '-movflags', '+faststart', out_mp4],
    stdin=subprocess.PIPE,
)
for i in range(n):
    a = final[i].astype(np.float32)[..., None] / 255
    comp = frames[i].astype(np.float32) * a + 255 * (1 - a)
    toile = np.full((H + 2 * pad, W + 2 * pad, 3), 255, np.uint8)
    toile[pad:pad + H, pad:pad + W] = comp.clip(0, 255).astype(np.uint8)
    cadre = Image.fromarray(toile[top:top + ch, left:left + cw]).resize((TW, TH), Image.LANCZOS)
    cadre = cadre.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    if i == 0:
        cadre.save(out_poster, 'WEBP', quality=86, method=6)
    enc.stdin.write(cadre.tobytes())
enc.stdin.close()
enc.wait()
print('ok', out_mp4, flush=True)
