'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/format';
import styles from './SalesChart.module.css';

interface Day {
  day: string;
  orders: number;
  grossCents: number;
}

const dayLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/**
 * Ventes jour par jour : une seule série (pas de légende, le titre du panneau la nomme),
 * barres fines arrondies au sommet, infobulle au survol et au clavier, tableau équivalent
 * pour les lecteurs d'écran.
 */
export function SalesChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (days.length === 0) return null;
  const max = Math.max(...days.map((day) => day.grossCents), 1);
  const total = days.reduce((sum, day) => sum + day.grossCents, 0);
  const shown = active !== null ? days[active] : null;

  return (
    <figure className={styles.figure}>
      <div className={styles.lecture} aria-hidden="true">
        {shown ? (
          <>
            <strong>{formatPrice(shown.grossCents)}</strong> le{' '}
            {dayLabel.format(new Date(`${shown.day.slice(0, 10)}T12:00:00`))} · {shown.orders}{' '}
            commande(s)
          </>
        ) : (
          <>
            <strong>{formatPrice(total)}</strong> encaissés sur la période
          </>
        )}
      </div>
      <div
        className={styles.zone}
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        onMouseLeave={() => setActive(null)}
        aria-hidden="true"
      >
        {days.map((day, index) => (
          <div
            key={day.day}
            className={styles.colonne}
            data-actif={active === index || undefined}
            onMouseEnter={() => setActive(index)}
          >
            <span
              className={styles.barre}
              style={{
                height: `${Math.max((day.grossCents / max) * 100, day.grossCents ? 2 : 0)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className={styles.axe} aria-hidden="true">
        <span>{dayLabel.format(new Date(`${days[0]!.day.slice(0, 10)}T12:00:00`))}</span>
        <span>{dayLabel.format(new Date(`${days.at(-1)!.day.slice(0, 10)}T12:00:00`))}</span>
      </div>
      <table className="visually-hidden">
        <caption>Ventes par jour</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Commandes</th>
            <th scope="col">Montant</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.day}>
              <td>{dayLabel.format(new Date(`${day.day.slice(0, 10)}T12:00:00`))}</td>
              <td>{day.orders}</td>
              <td>{formatPrice(day.grossCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
