import { Icon, type IconName } from '../ui/Icon';
import styles from './Reassurance.module.css';

/** Engagements de la marque (textes d'interface fixés par le cahier des charges). */
const COMMITMENTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'leaf',
    title: 'Frais et de qualité',
    text: 'Des produits choisis et préparés pour votre date.',
  },
  {
    icon: 'heart',
    title: 'Fait maison avec passion',
    text: 'Chaque création sort de la cuisine de Diani.',
  },
  {
    icon: 'lock',
    title: 'Paiement sécurisé',
    text: 'Stripe ou PayPal : aucune carte ne passe par le site.',
  },
  {
    icon: 'chat',
    title: 'À votre écoute',
    text: 'Une question ? Écrivez-nous, nous répondons vite.',
  },
];

export function Reassurance() {
  return (
    <section aria-labelledby="engagements-titre" className={styles.engagements}>
      <div className="conteneur">
        <h2 id="engagements-titre" className="visually-hidden">
          Nos engagements
        </h2>
        <ul role="list" className={styles.liste}>
          {COMMITMENTS.map((item) => (
            <li key={item.title} className={styles.item}>
              <Icon name={item.icon} size={28} className={styles.icone} />
              <h3 className={styles.titre}>{item.title}</h3>
              <p className={styles.texte}>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
