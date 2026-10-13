import { fillDays } from './dashboard.service';

describe('tableau de bord : série quotidienne', () => {
  it('un point par jour, zéro les jours sans vente, passage de mois compris', () => {
    const series = fillDays('2026-10-30', 4, [
      { day: '2026-10-31', orders: 2, grossCents: 7_598 },
      { day: '2026-11-02', orders: 1, grossCents: 1_500 },
    ]);
    expect(series).toEqual([
      { day: '2026-10-30', orders: 0, grossCents: 0 },
      { day: '2026-10-31', orders: 2, grossCents: 7_598 },
      { day: '2026-11-01', orders: 0, grossCents: 0 },
      { day: '2026-11-02', orders: 1, grossCents: 1_500 },
    ]);
  });

  it('ignore une ligne hors période', () => {
    expect(fillDays('2026-10-13', 1, [{ day: '2026-10-12', orders: 5, grossCents: 1 }])).toEqual([
      { day: '2026-10-13', orders: 0, grossCents: 0 },
    ]);
  });
});
