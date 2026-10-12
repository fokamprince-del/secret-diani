import { toCursorPage } from './cursor';

describe('toCursorPage', () => {
  const rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

  it('renvoie un curseur quand il reste des éléments', () => {
    expect(toCursorPage(rows, 2)).toEqual({ items: [{ id: 'c' }, { id: 'b' }], nextCursor: 'b' });
  });

  it('pas de curseur sur la dernière page', () => {
    expect(toCursorPage(rows, 3)).toEqual({ items: rows, nextCursor: null });
  });
});
