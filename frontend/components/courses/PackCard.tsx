import type { Pack } from '@/lib/api/types';
import { formatPrice, pluralize } from '@/lib/format';
import { ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import styles from './PackCard.module.css';

/** Un pack de formation : prix, contenus, formations incluses, bouton d'achat. */
export function PackCard({
  pack,
  salesOpen,
  highlighted = false,
}: {
  pack: Pack;
  salesOpen: boolean;
  highlighted?: boolean;
}) {
  return (
    <article
      data-apparition="monte"
      className={styles.pack}
      data-mis-en-avant={highlighted || undefined}
      aria-labelledby={`pack-${pack.slug}`}
    >
      {highlighted && <p className={styles.repere}>Le plus complet</p>}
      <h3 id={`pack-${pack.slug}`} className={styles.nom}>
        Pack {pack.name}
      </h3>
      {pack.summary && <p>{pack.summary}</p>}
      <p className={styles.prix}>{formatPrice(pack.priceCents)}</p>
      <ul className={styles.contenus}>
        {pack.features.map((feature) => (
          <li key={feature}>
            <Icon name="check" size={18} className={styles.coche} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {pack.courses.length > 0 && (
        <p className={styles.formations}>
          {pluralize(pack.courses.length, 'formation incluse', 'formations incluses')} :{' '}
          {pack.courses.map((course) => course.title).join(', ')}.
        </p>
      )}
      <div className={styles.action}>
        {salesOpen ? (
          <ButtonLink
            href={`/commande/pack/${pack.slug}`}
            variant={highlighted ? 'principal' : 'secondaire'}
            fullWidth
            data-pepites
          >
            Choisir ce pack<span className="visually-hidden"> {pack.name}</span>
          </ButtonLink>
        ) : (
          <p className={styles.ferme}>Les inscriptions rouvrent bientôt.</p>
        )}
      </div>
    </article>
  );
}
