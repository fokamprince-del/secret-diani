export interface ComparableKit {
  slug: string;
  name: string;
  fromPriceCents: number;
  items: { label: string; quantity: number }[];
}

export interface ComparisonRow {
  label: string;
  /** Quantité incluse dans chaque kit, dans l'ordre des colonnes ; null = absent du kit. */
  values: (number | null)[];
}

/** Clé de rapprochement des éléments : insensible à la casse, aux accents et aux espaces. */
function key(label: string): string {
  return label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Tableau comparatif des kits, déduit de leur composition (aucune double saisie) :
 * colonnes = kits du moins cher au plus cher, lignes = éléments dans leur ordre d'apparition.
 */
export function buildComparison(kits: ComparableKit[]): {
  kits: Omit<ComparableKit, 'items'>[];
  rows: ComparisonRow[];
} {
  const columns = [...kits].sort((a, b) => a.fromPriceCents - b.fromPriceCents);
  const rows = new Map<string, ComparisonRow>();
  columns.forEach((kit, column) => {
    for (const item of kit.items) {
      const id = key(item.label);
      let row = rows.get(id);
      if (!row) {
        row = { label: item.label, values: columns.map(() => null) };
        rows.set(id, row);
      }
      row.values[column] = (row.values[column] ?? 0) + item.quantity;
    }
  });
  return {
    kits: columns.map(({ slug, name, fromPriceCents }) => ({ slug, name, fromPriceCents })),
    rows: [...rows.values()],
  };
}
