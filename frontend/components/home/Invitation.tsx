import type { SocialLink } from '@/lib/social';
import { ButtonLink } from '../ui/Button';
import { CremeTrait } from '../ui/CremeTrait';
import { Icon, type IconName } from '../ui/Icon';
import styles from './Invitation.module.css';

/**
 * Dernier mot de l'accueil : une invitation à écrire, et le compte où suivre les créations.
 * Le réseau affiché est le premier configuré dans l'administration.
 */
export function Invitation({ social }: { social: SocialLink | null }) {
  return (
    <section aria-labelledby="invitation-titre" className={styles.invitation}>
      <div className={`conteneur ${styles.contenu}`} data-apparition="monte">
        <p className={styles.surtitre}>Une date, une envie, une question ?</p>
        <h2 id="invitation-titre">Parlons de votre prochaine fête</h2>
        <CremeTrait mouvement="apparition" className={styles.trait} />
        <p className={styles.texte}>
          Je vous réponds personnellement, avec les vrais prix et les vraies quantités.
        </p>
        <div className={styles.actions}>
          <ButtonLink href="/contact" withArrow>
            Écrivez-moi
          </ButtonLink>
          {social && (
            <a className={styles.social} href={social.href} rel="noopener" target="_blank">
              <Icon name={social.network as IconName} size={20} />
              Suivre {social.handle} sur {social.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
