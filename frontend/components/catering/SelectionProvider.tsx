'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SelectionItem } from '@/lib/catering';

const STORAGE_KEY = 'diani-traiteur-selection';
const MAX_QUANTITY = 50;

interface SelectionContextValue {
  items: SelectionItem[];
  add: (item: Omit<SelectionItem, 'quantity'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Sélection traiteur en préparation (« Ajouter à ma demande »), jointe à la demande
 * personnalisée. Gardée pour la session de l'onglet seulement (aucune donnée personnelle) ;
 * aucun prix n'est envoyé à l'API, qui recalcule l'estimation.
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      // Lecture du stockage de session : possible seulement après l'hydratation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setItems(JSON.parse(saved) as SelectionItem[]);
    } catch {
      // Stockage indisponible (navigation privée stricte) : sélection non conservée.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Sans stockage, la sélection vit le temps de la page.
    }
  }, [items, restored]);

  const add = useCallback((item: Omit<SelectionItem, 'quantity'>) => {
    setItems((current) => {
      const existing = current.find((entry) => entry.key === item.key);
      if (existing) {
        return current.map((entry) =>
          entry.key === item.key
            ? { ...entry, quantity: Math.min(MAX_QUANTITY, entry.quantity + 1) }
            : entry,
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    const value = Math.max(1, Math.min(MAX_QUANTITY, Math.round(quantity) || 1));
    setItems((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, quantity: value } : entry)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, add, setQuantity, remove, clear }),
    [items, add, setQuantity, remove, clear],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) throw new Error('useSelection doit être utilisé dans <SelectionProvider>.');
  return context;
}

export { MAX_QUANTITY };
