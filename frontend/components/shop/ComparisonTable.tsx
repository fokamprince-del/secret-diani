import type { KitComparison } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';
import styles from './ComparisonTable.module.css';

/**
 * Tableau comparatif des kits (déduit de leur composition par l'API). Défilement horizontal
 * au doigt sur mobile, zone focalisable pour le clavier, en-têtes de ligne et de colonne.
 */
export function ComparisonTable({ comparison }: { comparison: KitComparison }) {
  if (comparison.kits.length < 2 || comparison.rows.length === 0) return null;
  return (
    <div
      className={styles.defilement}
      tabIndex={0}
      role="region"
      aria-labelledby="comparatif-legende"
    >
      <table className={styles.tableau}>
        <caption id="comparatif-legende" className={styles.legende}>
          Ce que contient chaque kit
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Élément</span>
            </th>
            {comparison.kits.map((kit) => (
              <th key={kit.slug} scope="col">
                <span className={styles.kit}>{kit.name}</span>
                <span className={styles.prix}>{formatPrice(kit.fromPriceCents)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => (
                <td key={comparison.kits[index]?.slug ?? index}>
                  {value === null ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="visually-hidden">Non inclus</span>
                    </>
                  ) : (
                    <span>× {value}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
