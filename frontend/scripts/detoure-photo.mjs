// Détoure une photo de gâteau prise sur fond clair et neutre : croissance de région depuis les
// bords sur les pixels neutres, clairs et lisses (fond, ombres, plateau), grignotage des restes,
// fusion douce vers le blanc pur, puis recadrage serré (marge blanche de 8 %).
// Les originaux restent dans `medias-non-publies/originaux` ; vérifier le résultat à l'œil.
//
// Usage : node scripts/detoure-photo.mjs <entrée> <sortie.png> [pas=7] [chromaMax=18] [lumMin=120]
//   - chromaMax : plus haut si le gâteau est très coloré (rouge : 45) ; bas s'il est ivoire (20-28).
//   - variables : R, PASSES, SEUIL (grignotage) ; FONDU="y0,y1" efface sous la base (reflets).
// Réglages du 2026-11-14 : ruban-noir 10 45 100 ; couronne-argent 10 28 110 ;
// couronne-doree 10 28 110 avec FONDU=1135,1162 ; ruban-bleu-20-ans 10 20 120.
import sharp from 'sharp';

const [src, out, pasArg, chromaArg, lumArg] = process.argv.slice(2);
const PAS = Number(pasArg ?? 7); // écart max entre voisins (somme des 3 canaux / 3)
const CHROMA = Number(chromaArg ?? 18);
const LUM = Number(lumArg ?? 120);

const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const n = w * h;
const lum = new Float32Array(n);
const neutre = new Uint8Array(n);
for (let p = 0; p < n; p++) {
  const r = data[3 * p],
    g = data[3 * p + 1],
    b = data[3 * p + 2];
  lum[p] = (r + g + b) / 3;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  neutre[p] = chroma <= CHROMA && lum[p] >= LUM ? 1 : 0;
}
const diff = (a, b) =>
  (Math.abs(data[3 * a] - data[3 * b]) +
    Math.abs(data[3 * a + 1] - data[3 * b + 1]) +
    Math.abs(data[3 * a + 2] - data[3 * b + 2])) /
  3;

const fond = new Uint8Array(n);
const pile = new Int32Array(n);
let haut = 0;
const pousse = (p) => {
  if (!fond[p] && neutre[p]) {
    fond[p] = 1;
    pile[haut++] = p;
  }
};
for (let x = 0; x < w; x++) {
  pousse(x);
  pousse((h - 1) * w + x);
}
for (let y = 0; y < h; y++) {
  pousse(y * w);
  pousse(y * w + w - 1);
}
while (haut > 0) {
  const p = pile[--haut];
  const x = p % w,
    y = (p - x) / w;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const q = ny * w + nx;
    if (!fond[q] && neutre[q] && diff(p, q) <= PAS) {
      fond[q] = 1;
      pile[haut++] = q;
    }
  }
}

// Grignotage des restes neutres (blocs JPEG du plateau) : un pixel neutre dont la fenêtre
// 2R+1 est majoritairement du fond devient du fond. Quelques passes.
const R = Number(process.env.R ?? 4);
const PASSES = Number(process.env.PASSES ?? 6);
const SEUIL = Number(process.env.SEUIL ?? 0.55);
for (let it = 0; it < PASSES; it++) {
  // image intégrale du fond
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let ligne = 0;
    for (let x = 0; x < w; x++) {
      ligne += fond[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + ligne;
    }
  }
  let change = 0;
  const neuf = fond.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (fond[p] || !neutre[p]) continue;
      const x0 = Math.max(0, x - R),
        y0 = Math.max(0, y - R),
        x1 = Math.min(w, x + R + 1),
        y1 = Math.min(h, y + R + 1);
      const s =
        I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      if (s / ((x1 - x0) * (y1 - y0)) >= SEUIL) {
        neuf[p] = 1;
        change++;
      }
    }
  }
  fond.set(neuf);
  if (!change) break;
}
// Fondu bas facultatif (FONDU="y0,y1") : sous y1 tout est fond ; entre y0 et y1, fondu progressif.
const FONDU = process.env.FONDU ? process.env.FONDU.split(',').map(Number) : null;
if (FONDU) for (let y = FONDU[1]; y < h; y++) for (let x = 0; x < w; x++) fond[y * w + x] = 1;
// Îlots : ne garde que la plus grande composante non-fond (le gâteau).
{
  const etiquette = new Int32Array(n).fill(-1);
  let meilleure = -1,
    taille = 0,
    id = 0;
  for (let s = 0; s < n; s++) {
    if (fond[s] || etiquette[s] >= 0) continue;
    let t = 0;
    haut = 0;
    pile[haut++] = s;
    etiquette[s] = id;
    while (haut > 0) {
      const p = pile[--haut];
      t++;
      const x = p % w,
        y = (p - x) / w;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!fond[q] && etiquette[q] < 0) {
          etiquette[q] = id;
          pile[haut++] = q;
        }
      }
    }
    if (t > taille) {
      taille = t;
      meilleure = id;
    }
    id++;
  }
  for (let p = 0; p < n; p++) if (!fond[p] && etiquette[p] !== meilleure) fond[p] = 1;
}
// Masque adouci (flou 1,2 px) puis fusion vers le blanc.
const masque = Buffer.alloc(n);
for (let p = 0; p < n; p++) masque[p] = fond[p] ? 255 : 0;
const doux = await sharp(masque, { raw: { width: w, height: h, channels: 1 } })
  .blur(1.2)
  .extractChannel(0)
  .raw()
  .toBuffer();
if (doux.length !== n) throw new Error(`masque ${doux.length} != ${n}`);
const res = Buffer.alloc(3 * n);
let minX = w,
  minY = h,
  maxX = 0,
  maxY = 0;
for (let p = 0; p < n; p++) {
  let a = doux[p] / 255;
  if (FONDU) {
    const y = Math.floor(p / w);
    if (y > FONDU[0]) a = Math.max(a, Math.min(1, (y - FONDU[0]) / (FONDU[1] - FONDU[0])));
  }
  for (let k = 0; k < 3; k++) res[3 * p + k] = Math.round(data[3 * p + k] * (1 - a) + 255 * a);
  if (!fond[p]) {
    const x = p % w,
      y = (p - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const bw = maxX - minX + 1,
  bh = maxY - minY + 1;
const marge = Math.round(0.08 * Math.max(bw, bh));
console.log(out, {
  w,
  h,
  boite: [minX, minY, bw, bh],
  marge,
  fond: (fond.reduce((s, v) => s + v, 0) / n).toFixed(3),
});
await sharp(res, { raw: { width: w, height: h, channels: 3 } })
  .extract({ left: minX, top: minY, width: bw, height: bh })
  .extend({ top: marge, bottom: marge, left: marge, right: marge, background: '#ffffff' })
  .png()
  .toFile(out);
