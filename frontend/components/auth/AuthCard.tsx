import type { ReactNode } from 'react';
import { BUFFET_VIDEO, CREATIONS } from '@/lib/vitrine';
import { CremeTrait } from '../ui/CremeTrait';
import { Icon } from '../ui/Icon';
import { LoopVideo } from '../ui/LoopVideo';
import styles from './AuthCard.module.css';

const VISUELS = {
  gateau: CREATIONS[0]!,
  buffet: { ...BUFFET_VIDEO, title: 'Buffet de fête' },
  framboises: CREATIONS.find((creation) => creation.slug === 'framboises')!,
} as const;

/** Ce que le compte apporte (vrai pour toutes les clientes). */
const AVANTAGES = [
  'Vos formations, votre progression et vos certificats',
  'Vos commandes suivies et vos factures à portée de main',
  'Vos adresses enregistrées pour commander plus vite',
];

/**
 * Gabarit des pages de compte : écran partagé. Sur grand écran, un panneau visuel (vraie vidéo
 * de Diani sous un voile chocolat, citation, avantages du compte) et le formulaire dans une
 * carte ; sur mobile, le visuel devient un bandeau que la carte vient chevaucher.
 */
export function AuthCard({
  title,
  intro,
  children,
  footer,
  visual = 'gateau',
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Vidéo du panneau : gâteau mangue-passion, buffet salé ou gâteau aux framboises. */
  visual?: keyof typeof VISUELS;
}) {
  const media = VISUELS[visual];
  return (
    <div className={styles.page}>
      <aside className={styles.panneau} aria-hidden="true">
        <LoopVideo src={media.video!} poster={media.poster} focus={media.focus} />
        <div className={styles.voile} />
        <div className={styles.panneauContenu}>
          <p className={styles.marque}>
            Les Secrets de <span>Diani</span>
          </p>
          <p className={styles.citation}>Bien plus qu’une cuisine, une histoire de partage.</p>
          <ul role="list" className={styles.avantages}>
            {AVANTAGES.map((avantage) => (
              <li key={avantage}>
                <Icon name="check" size={18} />
                {avantage}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className={styles.colonne}>
        <div className={styles.carte}>
          <div className={styles.entete}>
            <h1 className={styles.titre}>{title}</h1>
            <CremeTrait mouvement="chargement" className={styles.trait} />
            {intro && <div className={styles.intro}>{intro}</div>}
          </div>
          {children}
          {footer && <div className={styles.pied}>{footer}</div>}
        </div>
        <p className={styles.securite}>
          <Icon name="lock" size={16} />
          Connexion chiffrée · vos données restent privées
        </p>
      </div>
    </div>
  );
}
