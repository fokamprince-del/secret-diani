import { BUCHES, BUFFET_PHOTO } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { Drip } from '../ui/Drip';
import { StaticPhoto } from '../ui/StaticPhoto';
import styles from './Saison.module.css';

/**
 * Les fêtes de fin d'année (en écho au bandeau d'annonce) : les bûches roulées et le buffet,
 * deux photos qui se chevauchent sur un fond ganache. Commande sur demande, comme le reste du
 * traiteur.
 */
export function Saison() {
  return (
    <section aria-labelledby="saison-titre" className={styles.saison}>
      <div className={`conteneur ${styles.grille}`}>
        <div className={styles.photos}>
          <div className={styles.principale} data-apparition="devoile">
            <StaticPhoto photo={BUCHES} sizes="(min-width: 64rem) 420px, 70vw" focus="50% 60%" />
          </div>
          <div className={styles.secondaire} data-apparition="devoile">
            <StaticPhoto
              photo={BUFFET_PHOTO}
              sizes="(min-width: 64rem) 240px, 40vw"
              focus="50% 60%"
            />
          </div>
          <p className={styles.etiquette} aria-hidden="true">
            <span>Saison</span> des fêtes
          </p>
        </div>
        <div className={styles.texte} data-apparition="monte">
          <p className={styles.surtitre}>Pour vos repas de fêtes</p>
          <h2 id="saison-titre">Les fêtes de fin d’année se préparent maintenant</h2>
          <p>
            Bûches roulées coco-fraise ou mangue-passion, buffets salés pour recevoir toute la
            famille : dites-moi votre date et votre nombre d’invités, je compose avec vous.
          </p>
          <ul role="list" className={styles.points}>
            <li>Sur commande, préparé pour votre date</li>
            <li>Retrait ou livraison, selon ce que nous convenons</li>
            <li>Un acompte suffit pour réserver</li>
          </ul>
          <div className={styles.actions}>
            <ButtonLink href="/traiteur#demande" withArrow>
              Je réserve ma date
            </ButtonLink>
            <ButtonLink href="/traiteur" variant="discret" className={styles.lienClair}>
              Voir la carte du traiteur
            </ButtonLink>
          </div>
        </div>
      </div>
      <Drip color="var(--ganache)" />
    </section>
  );
}
