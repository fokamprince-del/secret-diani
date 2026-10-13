import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jetons lus directement dans la feuille : le test suit toute modification des couleurs. */
const css = readFileSync(join(process.cwd(), 'styles/tokens.css'), 'utf8');
const token = (name: string): string => {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Jeton --${name} introuvable`);
  return match[1];
};

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('contrastes WCAG AA des jetons', () => {
  // Texte courant : 4,5:1 minimum.
  const bodyText: [string, string][] = [
    ['texte', 'creme'],
    ['texte', 'sable'],
    ['texte', 'blanc'],
    ['terra-d', 'creme'],
    ['terra-d', 'sable'],
    ['terra-d', 'blanc'],
    ['cacao', 'creme'],
    ['cacao', 'sable'],
    ['cacao', 'peche'],
    ['blanc', 'terra'],
    ['blanc', 'terra-d'],
    ['blanc', 'cacao'],
    ['erreur', 'creme'],
    ['erreur', 'blanc'],
    ['succes', 'blanc'],
  ];

  it.each(bodyText)('--%s sur --%s ≥ 4,5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  // Grands textes (≥ 24 px ou 18,66 px gras) et éléments graphiques : 3:1.
  const largeText: [string, string][] = [
    ['terra', 'creme'],
    ['texte-s', 'creme'],
    ['texte-s', 'sable'],
  ];

  it.each(largeText)('--%s sur --%s ≥ 3:1 (grands textes uniquement)', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it('documente que --terra et --texte-s ne suffisent pas pour du petit texte sur crème', () => {
    expect(contrast(token('terra'), token('creme'))).toBeLessThan(4.5);
    expect(contrast(token('texte-s'), token('creme'))).toBeLessThan(4.5);
  });
});
