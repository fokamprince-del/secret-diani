import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Accordion.module.css';

interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  /** Nom de groupe : une seule section ouverte à la fois (attribut natif `name`). */
  exclusiveGroup?: string;
}

/**
 * Accordéon natif `<details>` : clavier, lecteurs d'écran et recherche dans la page
 * fonctionnent sans JavaScript. Pas de titre dans `<summary>` (rôle bouton : il serait ignoré).
 * L'ouverture est animée en CSS quand c'est autorisé.
 */
export function Accordion({ items, exclusiveGroup }: AccordionProps) {
  return (
    <div className={styles.accordeon}>
      {items.map((item) => (
        <details key={item.id} id={item.id} name={exclusiveGroup} className={styles.section}>
          <summary className={styles.question}>
            <span className={styles.intitule}>{item.title}</span>
            <Icon name="chevronDown" size={20} className={styles.chevron} />
          </summary>
          <div className={styles.reponse}>{item.content}</div>
        </details>
      ))}
    </div>
  );
}
