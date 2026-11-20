"""Détourage d'une photo de gâteau (fond gris, plateau tournant) sur blanc pur.

usage : python detoure-photo.py source.jpg sortie.png RATIO_H/L [chaud=20] [rubans=1] [base=Y arc=B]

Prérequis : pip install "rembg[cpu]" opencv-python-headless. Le masque IS-Net est calculé ici.
Corps : zone chaude (crème, rouge) complétée par son enveloppe convexe, bornée par sa base
(demi-ellipse : point le plus bas Y, profondeur B, relevés sur l'original) : la planche et le
plateau, qui reflètent la crème, sont exclus. Au-dessus du corps (couronne, bougie) : masque
IS-Net. Rubans noirs : pixels sombres du masque qui touchent le corps. Remplace, pour ces
photos, `detoure-photo.mjs` (croissance de région) qui laissait des restes de planche en escalier.

Réglages du 2026-11-20 (originaux dans medias-non-publies/originaux) :
  couronne-argent.jpg 1.5567 base=1183 arc=70
  couronne-doree.jpg  1.6684 base=1150 arc=60
  ruban-noir.jpg      1.2188 rubans=1 base=1192 arc=80
Puis export AVIF/WebP/JPEG aux largeurs déclarées dans lib/vitrine.ts (sharp, Lanczos).
"""
import sys

import cv2
import numpy as np

src, out, ratio = sys.argv[1], sys.argv[2], float(sys.argv[3])
opts = dict(a.split('=', 1) for a in sys.argv[4:])
CHAUD = float(opts.get('chaud', 20))
img = cv2.cvtColor(cv2.imread(src), cv2.COLOR_BGR2RGB)
from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402

alpha = np.asarray(remove(Image.fromarray(img), session=new_session('isnet-general-use'), only_mask=True))
alpha = alpha.astype(np.float32) / 255
H, W = alpha.shape
f = img.astype(np.int16)
c = (f[..., 0] - f[..., 2]).astype(np.float32)
lum = f.mean(axis=2)

# Corps.
chaud = cv2.GaussianBlur(np.clip((c - CHAUD + 6) / 12, 0, 1), (0, 0), 2) * (alpha > 0.3)
corps = (chaud > 0.5).astype(np.uint8)
corps = cv2.morphologyEx(corps, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
nb, lab, st, _ = cv2.connectedComponentsWithStats(corps, 8)
corps = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
env = np.zeros_like(corps)
cv2.fillConvexPoly(env, cv2.convexHull(cv2.findNonZero(corps)), 1)
corps = cv2.erode(env, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
if 'base' in opts:
    # Base du gâteau : demi-ellipse (point le plus bas, profondeur), relevée sur l'original. La
    # planche et le plateau, en dessous, reflètent la crème : on coupe à la géométrie.
    base, arc = int(opts['base']), int(opts['arc'])
    yc = base - arc
    xr = np.nonzero(corps[yc])[0]
    cxe, ae = (xr.min() + xr.max()) / 2, (xr.max() - xr.min()) / 2
    # Flancs : pas plus large qu'à mi-hauteur (la planche dépasse en bas).
    ym = (np.nonzero(corps.any(axis=1))[0].min() + yc) // 2
    xm = np.nonzero(corps[ym])[0]
    corps[ym:, :xm.min()] = 0
    corps[ym:, xm.max() + 1:] = 0
    xr = np.nonzero(corps[yc])[0]
    cxe, ae = (xr.min() + xr.max()) / 2, (xr.max() - xr.min()) / 2
    cle = np.zeros_like(corps)
    cle[:yc] = 1
    cv2.ellipse(cle, (int(cxe), yc), (int(ae), arc), 0, 0, 180, 1, -1)
    corps &= cle
ys = np.nonzero(corps.any(axis=1))[0]
xs = np.nonzero(corps.any(axis=0))[0]
haut, bas = ys.min(), ys.max()
print('corps', haut, bas, xs.min(), xs.max())

# Bande du bord (14 px) : couleur vérifiée (chaud, ou sombre : ruban, chocolat).
ok = np.maximum(np.clip((c - CHAUD + 4) / 8, 0, 1), ((lum < 90) & (alpha > 0.7)).astype(np.float32))
ok = cv2.GaussianBlur(np.clip((ok - 0.35) / 0.5, 0, 1), (0, 0), 1)
inter = np.clip(cv2.distanceTransform(corps, cv2.DIST_L2, 5) / 14, 0, 1)
a_corps = cv2.GaussianBlur(corps.astype(np.float32), (0, 0), 1.2) * (inter + (1 - inter) * ok)

# Au-dessus du corps (couronne, bougie), jusqu'au tiers haut du dessus : masque IS-Net.
dessus = np.zeros((H, W), np.float32)
lim = haut + int(0.08 * (bas - haut))
dessus[:lim, max(0, xs.min() - 20):xs.max() + 21] = 1
dessus = cv2.GaussianBlur(dessus, (0, 0), 3)
a_dessus = alpha * dessus

# Rubans noirs qui pendent sur les côtés.
a_ruban = np.zeros_like(alpha)
if opts.get('rubans') == '1':
    sombre = ((lum < 80) & (alpha > 0.5)).astype(np.uint8)
    sombre = cv2.dilate(sombre, np.ones((3, 3), np.uint8))
    nb, lab, st, _ = cv2.connectedComponentsWithStats(sombre, 8)
    voisin = cv2.dilate(corps, np.ones((15, 15), np.uint8))
    for k in range(1, nb):
        z = lab == k
        if st[k, cv2.CC_STAT_AREA] > 80 and voisin[z].any():
            a_ruban[z] = 1
    a_ruban = cv2.GaussianBlur(a_ruban, (0, 0), 0.8) * np.clip(alpha * 1.5, 0, 1)

a = np.clip(np.maximum.reduce([a_corps, a_dessus, a_ruban]), 0, 1)
a = np.clip((a - 0.06) / 0.94, 0, 1)

# Composition sur blanc, cadrage 8 % de marge, au ratio demandé.
comp = (img.astype(np.float32) * a[..., None] + 255 * (1 - a[..., None])).clip(0, 255).astype(np.uint8)
yy, xx = np.nonzero(a > 0.5)
x0, x1, y0, y1 = xx.min(), xx.max(), yy.min(), yy.max()
w, h = (x1 - x0) * 1.16, (y1 - y0) * 1.16
if h / w < ratio:
    h = w * ratio
else:
    w = h / ratio
pad = int(max(w, h))
toile = np.full((H + 2 * pad, W + 2 * pad, 3), 255, np.uint8)
toile[pad:pad + H, pad:pad + W] = comp
cx, cy = (x0 + x1) / 2 + pad, (y0 + y1) / 2 + pad
crop = toile[int(cy - h / 2):int(cy + h / 2), int(cx - w / 2):int(cx + w / 2)]
cv2.imwrite(out, cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
print('ok', out, crop.shape)
