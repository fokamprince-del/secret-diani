import styles from './Drip.module.css';

/** Coulures (position en %, largeur, longueur), fixes : le motif est le même à chaque rendu. */
const COULURES: [number, number, number][] = [
  [4, 22, 34],
  [11, 16, 58],
  [19, 26, 26],
  [27, 18, 72],
  [35, 22, 40],
  [44, 16, 22],
  [51, 24, 64],
  [60, 18, 30],
  [68, 26, 84],
  [77, 16, 36],
  [84, 22, 56],
  [93, 18, 28],
];

const LARGEUR = 1200;
const NAPPE = 14;

/** Tracé d'une nappe qui coule : bord droit en haut, gouttes arrondies en bas. */
function tracer() {
  let d = `M0 0 H${LARGEUR} V${NAPPE}`;
  for (const [position, width, length] of [...COULURES].reverse()) {
    const x = (position / 100) * LARGEUR;
    const r = width / 2;
    const bas = NAPPE + length;
    d +=
      ` L${x + width} ${NAPPE} Q${x + r} ${NAPPE} ${x + r} ${NAPPE + 8}` +
      ` L${x + r} ${bas} A${r} ${r} 0 0 1 ${x - r} ${bas}` +
      ` L${x - r} ${NAPPE + 8} Q${x - r} ${NAPPE} ${x - width} ${NAPPE}`;
  }
  return `${d} L0 ${NAPPE} Z`;
}

const TRACE = tracer();
const HAUTEUR = NAPPE + Math.max(...COULURES.map(([, w, l]) => l + w / 2)) + 2;

interface DripProps {
  /** Couleur du nappage (valeur CSS, ex. `var(--ganache)`). */
  color: string;
  className?: string;
}

/**
 * Le drip, motif des gâteaux de Diani : une nappe qui coule sur la section suivante.
 * Décoratif ; il « coule » une fois en entrant à l'écran (Apparitions), immobile sinon.
 */
export function Drip({ color, className }: DripProps) {
  return (
    <svg
      className={[styles.drip, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      style={{ color }}
      data-apparition="coule"
    >
      <path d={TRACE} fill="currentColor" />
    </svg>
  );
}
