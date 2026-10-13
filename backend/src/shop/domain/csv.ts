/**
 * CSV pour les tableurs français : séparateur « ; », BOM UTF-8, champs entre guillemets.
 * Protection contre l'injection de formules (CSV injection, OWASP) : une cellule qui commence
 * par =, +, -, @, tabulation ou retour chariot est préfixée d'une apostrophe, sauf un nombre.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER = /^-?\d+([.,]\d+)?$/;
/** Marque d'ordre des octets : Excel reconnaît alors l'UTF-8 (accents). */
const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_START.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
