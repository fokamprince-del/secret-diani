import styles from './CremeTrait.module.css';

/**
 * Tracés du trait de crème, la signature visuelle (docs/PERSONNALITE.md) : un trait souple,
 * comme tiré à la poche à douille. `pathLength="1"` permet de l'animer sans mesurer le tracé.
 */
const TRACES = {
  /** Sous le titre du hero : long, avec un reflet de crème. */
  titre: {
    viewBox: '0 0 420 34',
    path: 'M6 22 C 60 6, 110 30, 170 18 S 280 4, 330 16 S 400 24, 414 12',
    reflet: 'M40 15 C 90 6, 120 20, 170 13',
  },
  /** Sous un titre de section ou une signature : court. */
  souligne: {
    viewBox: '0 0 200 16',
    path: 'M4 10 C 50 3, 90 14, 140 8 S 186 5, 196 9',
    reflet: undefined,
  },
  /** Petit trait devant un numéro d'univers (remplace le filet doré). */
  puce: {
    viewBox: '0 0 48 10',
    path: 'M3 6 C 14 2, 26 9, 45 4',
    reflet: undefined,
  },
} as const;

interface CremeTraitProps {
  variant?: keyof typeof TRACES;
  /**
   * `chargement` : se dessine à l'ouverture de la page (hero, CSS seul) ;
   * `apparition` : se dessine quand il entre à l'écran (voir Apparitions) ;
   * `fixe` : déjà dessiné.
   */
  mouvement?: 'chargement' | 'apparition' | 'fixe';
  className?: string;
}

/** Purement décoratif : masqué des lecteurs d'écran, toujours visible au repos. */
export function CremeTrait({
  variant = 'souligne',
  mouvement = 'fixe',
  className,
}: CremeTraitProps) {
  const trace = TRACES[variant];
  return (
    <svg
      className={[styles.trait, styles[variant], className].filter(Boolean).join(' ')}
      viewBox={trace.viewBox}
      aria-hidden="true"
      focusable="false"
      data-mouvement={mouvement}
      data-apparition={mouvement === 'apparition' ? 'trait' : undefined}
    >
      <path className={styles.creme} d={trace.path} pathLength={1} />
      {trace.reflet && <path className={styles.reflet} d={trace.reflet} pathLength={1} />}
    </svg>
  );
}
