"""Détourage stable d'une vidéo de gâteau qui tourne, sur fond blanc pur.

usage : python detoure-video.py source.mp4 sortie.mp4 affiche.webp LARGEUR HAUTEUR [cle=valeur ...]
  debug=dossier   images de contrôle (une toutes les 30) et contour sur l'image médiane
  plafond=Y       rien au-dessus de cette ligne (joints de carrelage au-dessus du décor)
  blanc=1         le bas du gâteau est blanc (et non crème) : accepté au bord de la silhouette
  enveloppe=1     corps complété par son enveloppe convexe (cylindre) ; 0 pour désactiver
  enveloppe=tout  enveloppe aussi sur le haut (dessus plat, sans rosaces)
  base=Y arc=B    bas blanc invisible : base du cylindre fermée par une demi-ellipse (point le
                  plus bas Y, profondeur B), en coordonnées de la vidéo stabilisée
  or=N            sur le corps, n'ajouter que le franchement doré (rouge − bleu > N)
  elargir=N       silhouette élargie de N px, bord tracé par la couleur (gâteau crème)
  bande=N         largeur (px) de la bande du bord où la couleur est vérifiée (16)
  chaud=N         seuil rouge − bleu (14 par défaut ; plus haut si le mur a des reflets chauds)

Prérequis (environnement isolé conseillé) : pip install "rembg[cpu]" opencv-python-headless ;
ffmpeg dans le PATH. Source : la vidéo d'origine (medias-non-publies/originaux), en 464×848.

Principe : le gâteau tourne sur lui-même, donc le contour de son corps ne change pas. On
stabilise la vidéo sur le gâteau (caméra tenue à la main ; le mur, plus loin, bouge autrement),
on calcule ce contour une seule fois (zone « chaude » : la crème est jaune, le décor gris
neutre), puis on ne détoure image par image (IS-Net) que ce qui dépasse : chiffres, plaques,
framboises. Le détourage image par image seul rongeait les flancs crème et faisait clignoter
le bord (vidéos du 2026-11-19, refaites le 2026-11-20).

Réglages du 2026-11-20 :
  framboises      680 882 chaud=20
  caramel-18      786 872 plafond=200 chaud=16
  anniversaire-33 798 956 plafond=270 chaud=22 enveloppe=tout or=45 elargir=12
  mangue-passion  642 840 blanc=1 base=740 arc=55 chaud=20 bande=30
"""
import subprocess
import sys

import cv2
import numpy as np

src, out_mp4, out_poster, TW, TH = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
opts = dict(a.split('=', 1) for a in sys.argv[6:])
DEBUG = opts.get('debug')
PLAFOND = int(opts.get('plafond', 0))
BLANC = opts.get('blanc') == '1'
ENVELOPPE = opts.get('enveloppe', '1') in ('1', 'tout')
OR = float(opts['or']) if 'or' in opts else None
SEUIL_CHAUD = float(opts.get('chaud', 14))  # rouge − bleu : au-dessus, crème, or, fruits ; en dessous, gris neutre du décor
MARGE = 0.08
R = 3  # lissage temporel du détourage image par image (±0,1 s)

W, H = 464, 848
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                     capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
n = len(frames)
from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402

session = new_session('isnet-general-use')
alphas = np.stack([np.asarray(remove(Image.fromarray(f), session=session, only_mask=True)) for f in frames])
del session  # libère le modèle avant le rendu (machines à mémoire limitée)


def chaleur(f):
    c = f[..., 0].astype(np.float32) - f[..., 2].astype(np.float32)
    return cv2.GaussianBlur(np.clip((c - SEUIL_CHAUD + 8) / 16, 0, 1), (0, 0), 2.5)


# 1. Stabilisation sur le gâteau lui-même (le mur, plus loin, bouge autrement : parallaxe).
cartes = [chaleur(f) * (a > 60) for f, a in zip(frames, alphas)]
dx, dy = np.zeros(n), np.zeros(n)
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5)
for i in range(1, n):
    warp = np.float32([[1, 0, dx[i - 1]], [0, 1, dy[i - 1]]])
    try:
        _, warp = cv2.findTransformECC(cartes[0], cartes[i], warp, cv2.MOTION_TRANSLATION, crit, None, 5)
    except cv2.error:
        pass
    dx[i], dy[i] = warp[0, 2], warp[1, 2]
k = np.ones(5) / 5
dx = np.convolve(np.pad(dx, 2, mode='edge'), k, 'valid')
dy = np.convolve(np.pad(dy, 2, mode='edge'), k, 'valid')
print('tremblement x', round(dx.min(), 1), round(dx.max(), 1), 'y', round(dy.min(), 1), round(dy.max(), 1), flush=True)


def recale(img, i, valeur):
    m = np.float32([[1, 0, -dx[i]], [0, 1, -dy[i]]])
    return cv2.warpAffine(img, m, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=valeur)


F = np.stack([recale(frames[i], i, (255, 255, 255)) for i in range(n)])
A = np.stack([recale(alphas[i], i, 0) for i in range(n)])
C = np.stack([recale(c, i, 0) for i, c in enumerate(cartes)])

# 2. Silhouette fixe du corps.
fixe = (np.median(C, axis=0) > 0.5).astype(np.uint8)
nb, lab, stats, _ = cv2.connectedComponentsWithStats(fixe, 8)
fixe = (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
largeurs = fixe.sum(axis=1)
corps_lignes = np.nonzero(largeurs > 0.85 * largeurs.max())[0]
y_corps = corps_lignes.min()  # au-dessus : rosaces et décor, au contour irrégulier
if ENVELOPPE:
    # Un cylindre vu de trois quarts est convexe : l'enveloppe bouche les encoches (coulures
    # noires, bas blanc). Appliquée sous le haut du corps seulement.
    sans_pics = cv2.morphologyEx(fixe, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    pts = cv2.findNonZero(sans_pics)
    if 'base' in opts:
        # Demi-ellipse de la base, aussi large que le corps.
        base, arc = int(opts['base']), int(opts['arc'])
        xs_c = np.nonzero(sans_pics[corps_lignes].any(axis=0))[0]
        cxe, ae = (xs_c.min() + xs_c.max()) / 2, (xs_c.max() - xs_c.min()) / 2
        t = np.linspace(0, np.pi, 90)
        arcpts = np.stack([cxe + ae * np.cos(t), base - arc + arc * np.sin(t)], 1).astype(np.int32)
        pts = np.concatenate([pts.reshape(-1, 2), arcpts]).astype(np.int32)
    env = np.zeros_like(fixe)
    cv2.fillConvexPoly(env, cv2.convexHull(pts), 1)
    if opts.get('enveloppe') != 'tout':
        env[:y_corps] = 0
    fixe |= env
else:
    for y in corps_lignes:
        xs = np.nonzero(fixe[y])[0]
        fixe[y, xs[0]:xs[-1] + 1] = 1
fixe = cv2.morphologyEx(fixe, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
fixe = cv2.morphologyEx(fixe, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
# Bord rentré de 4 px (le gâteau oscille encore d'un ou deux pixels) puis adouci.
ELARGIR = int(opts.get('elargir', 0))
if ELARGIR:
    # Silhouette élargie : c'est alors la couleur, image par image, qui trace le bord.
    fixe = cv2.dilate(fixe, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ELARGIR + 1,) * 2))
else:
    fixe = cv2.erode(fixe, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
fixe_doux = cv2.GaussianBlur(fixe.astype(np.float32), (0, 0), 1.3)
# Bande de 16 px au bord : la couleur y est vérifiée image par image.
# (avec une silhouette élargie, la marge ajoutée est décidée par la couleur seule).
interieur = np.clip((cv2.distanceTransform(fixe, cv2.DIST_L2, 5) - 2 * ELARGIR) / int(opts.get('bande', 16)), 0, 1).astype(np.float32)
lignes = np.nonzero(fixe.any(axis=1))[0]
haut = lignes.min()
cols = np.nonzero(fixe.any(axis=0))[0]
print('silhouette lignes', haut, lignes.max(), 'colonnes', cols.min(), cols.max(), flush=True)

# 3. Ce qui dépasse, image par image.
voisin = cv2.dilate(fixe, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
zone_corps = np.zeros((H, W), np.float32)
zone_corps[max(0, haut - 60):] = 1  # « corps » au sens large : du haut des rosaces au plateau
dessus = np.zeros((H, W), bool)
# Fenêtre où un décor peut dépasser : au-dessus du gâteau, pas plus large que son dessus.
m_ = ELARGIR + 10 if ELARGIR else -15
dessus[PLAFOND:haut + ELARGIR + 25, max(0, cols.min() + m_):cols.max() - m_ + 1] = True
alpha_final = np.empty((n, H, W), np.float32)
for i in range(n):
    a, b = max(0, i - R), min(n, i + R + 1)
    e = np.median(A[a:b], axis=0).astype(np.uint8)
    e = cv2.morphologyEx(e, cv2.MORPH_OPEN, k5)
    f = F[i].astype(np.int16)
    lum = f.mean(axis=2)
    chaud = np.clip(((f[..., 0] - f[..., 2]) - SEUIL_CHAUD + 4) / 8, 0, 1).astype(np.float32)
    # Matière admise au bord du corps : chaude, chocolat noir franchement détouré, ou blanc vif.
    bord_ok = np.maximum(chaud, ((lum < 90) & (A[i] > 200)).astype(np.float32))
    if BLANC:
        bord_ok = np.maximum(bord_ok, np.clip((lum - 200) / 20, 0, 1).astype(np.float32))
    if OR is not None:
        ajout = np.clip(((f[..., 0] - f[..., 2]) - OR + 4) / 8, 0, 1).astype(np.float32)
    else:
        ajout = chaud
    ajout = cv2.GaussianBlur(ajout, (0, 0), 1)
    # Transition franche : un mur à peine chaud ne laisse pas de voile.
    bord_ok = cv2.GaussianBlur(np.clip((bord_ok - 0.35) / 0.5, 0, 1), (0, 0), 1)

    bin_ = ((e > 128) & (fixe == 0)).astype(np.uint8)
    nb, lab, stats, _ = cv2.connectedComponentsWithStats(bin_, 8)
    garde = np.zeros(nb, bool)
    for c in range(1, nb):
        if stats[c, cv2.CC_STAT_AREA] < 60:
            continue
        zone = lab == c
        bas_c = stats[c, cv2.CC_STAT_TOP] + stats[c, cv2.CC_STAT_HEIGHT]
        # Un chiffre peut flotter au-dessus du gâteau (sa tige est cachée) : admis s'il est dans
        # la fenêtre du décor.
        flotte = stats[c, cv2.CC_STAT_TOP] < haut and dessus[zone].mean() > 0.5
        if not flotte and not voisin[zone].any():
            continue
        # Décor au-dessus du gâteau (chiffre, même vu de dos, blanc) ; ailleurs, seulement ce qui
        # est chaud (or, framboise) : ombres, plateau et billets posés à plat ne sont pas gardés.
        if bas_c <= haut + 25 or stats[c, cv2.CC_STAT_TOP] < haut - 10 or ajout[zone].mean() > 0.3:
            garde[c] = True
    masque = cv2.dilate(garde[lab].astype(np.uint8), k5).astype(bool)
    ef = np.clip((np.where(masque, e, 0).astype(np.float32) / 255 - 0.1) / 0.8, 0, 1)
    # Au-dessus : seulement dans la fenêtre du décor ; sur le corps : seulement les pixels chauds.
    ef = np.where(zone_corps > 0, ef * np.where(dessus, 1, ajout), np.where(dessus, ef, 0))
    a_fixe = fixe_doux * (interieur + (1 - interieur) * bord_ok)
    alpha_final[i] = np.maximum(a_fixe, ef)

# 4. Cadrage fixe : tout ce qui apparaît dans au moins 2 % des images.
union = (alpha_final > 0.5).mean(axis=0) > 0.02
ys, xs = np.nonzero(union)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
cw, ch = (x1 - x0) * (1 + 2 * MARGE), (y1 - y0) * (1 + 2 * MARGE)
if cw / ch < TW / TH:
    cw = ch * TW / TH
else:
    ch = cw * TH / TW
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
pad = int(max(cw, ch))
left, top = int(round(cx - cw / 2)) + pad, int(round(cy - ch / 2)) + pad
cw, ch = int(round(cw)), int(round(ch))
print('cadre', left - pad, top - pad, cw, ch, flush=True)

enc = subprocess.Popen(
    ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{TW}x{TH}', '-r', '30',
     '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
     '-profile:v', 'high', '-movflags', '+faststart', out_mp4],
    stdin=subprocess.PIPE,
)
for i in range(n):
    a = alpha_final[i][..., None]
    comp = F[i].astype(np.float32) * a + 255 * (1 - a)
    toile = np.full((H + 2 * pad, W + 2 * pad, 3), 255, np.uint8)
    toile[pad:pad + H, pad:pad + W] = comp.clip(0, 255).astype(np.uint8)
    cadre = cv2.resize(toile[top:top + ch, left:left + cw], (TW, TH), interpolation=cv2.INTER_LANCZOS4)
    flou = cv2.GaussianBlur(cadre, (0, 0), 1.2)
    cadre = cv2.addWeighted(cadre, 1.5, flou, -0.5, 0)
    if i == 0:
        cv2.imwrite(out_poster, cv2.cvtColor(cadre, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 88])
    if DEBUG and i % 30 == 0:
        cv2.imwrite(f'{DEBUG}/f{i:03d}.png', cv2.cvtColor(cadre, cv2.COLOR_RGB2BGR))
    enc.stdin.write(cadre.tobytes())
enc.stdin.close()
enc.wait()
if DEBUG:
    cv2.imwrite(f'{DEBUG}/fixe.png', fixe * 255)
if DEBUG:
    med = np.median(F[::4], axis=0).astype(np.uint8)
    cs, _ = cv2.findContours(fixe, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(med, cs, -1, (255, 0, 0), 1)
    for y in range(0, H, 50):
        cv2.putText(med, str(y), (2, y), 0, 0.4, (0, 0, 255), 1)
    cv2.imwrite(f'{DEBUG}/contour.png', cv2.cvtColor(med, cv2.COLOR_RGB2BGR))
print('ok', out_mp4, flush=True)
