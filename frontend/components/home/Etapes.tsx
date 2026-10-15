import { ButtonLink } from '../ui/Button';
import { CremeTrait } from '../ui/CremeTrait';
import styles from './Etapes.module.css';

/** Le parcours d'une commande traiteur, tel que décrit dans les conditions (acompte, solde). */
const ETAPES = [
  {
    titre: 'Vous me dites tout',
    texte: 'La date, le nombre d’invités, vos envies : par le formulaire, WhatsApp ou téléphone.',
  },
  {
    titre: 'Je vous confirme',
    texte: 'Je vous recontacte pour caler chaque détail et vous donner le prix exact.',
  },
  {
    titre: 'Un acompte, et c’est réservé',
    texte: 'Votre date est bloquée. Le solde se règle au retrait ou à la livraison.',
  },
  {
    titre: 'Le jour J',
    texte: 'Tout est préparé à la main pour votre fête. Il ne reste qu’à partager.',
  },
];

/** « Comment ça se passe » : quatre étapes numérotées, reliées par le trait de crème. */
export function Etapes() {
  return (
    <section aria-labelledby="etapes-titre" className={styles.etapes}>
      <div className="conteneur">
        <div className={styles.entete}>
          <p className={styles.surtitre}>Simple et sans surprise</p>
          <h2 id="etapes-titre">Comment se passe une commande</h2>
          <CremeTrait mouvement="apparition" />
        </div>
        <ol role="list" className={styles.liste}>
          {ETAPES.map((etape, index) => (
            <li key={etape.titre} className={styles.etape} data-apparition="monte">
              <span className={styles.numero} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.titre}>{etape.titre}</h3>
              <p>{etape.texte}</p>
            </li>
          ))}
        </ol>
        <div className={styles.action}>
          <ButtonLink href="/traiteur#demande" withArrow>
            Je demande un devis
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
