const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Échappe toute valeur insérée dans le HTML (aucune donnée utilisateur n'est interprétée). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function greeting(firstName: string | null): string {
  return firstName ? `Bonjour ${firstName},` : 'Bonjour,';
}

export interface LayoutBlock {
  /** Paragraphe de texte brut (échappé). */
  paragraph?: string;
  /** Bouton d'action : libellé + URL (échappés). */
  button?: { label: string; url: string };
  /** Code à recopier (chiffres espacés, très lisible), avec une légende. */
  code?: { value: string; caption: string };
  /** Récapitulatif en tableau : libellé à gauche, valeur à droite ; `total` en gras. */
  rows?: { label: string; value: string; total?: boolean }[];
  /** Encadré crème (information importante, pièce jointe…). */
  note?: string;
}

// Charte : crème, terracotta, chocolat, touche mangue (couleurs du site).
const C = {
  creme: '#F9EEE8',
  carte: '#FFFBF8',
  sable: '#F0E2D9',
  terra: '#9B6155',
  cacao: '#5E2F1B',
  ganache: '#3E2418',
  texte: '#5A504A',
  doux: '#7A6B63',
  mangue: '#E8B923',
  filet: '#EADBD2',
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';

function blockHtml(block: LayoutBlock): string {
  if (block.button) {
    const url = escapeHtml(block.button.url);
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 12px;"><tr><td style="border-radius:999px;background:${C.terra};">
<a href="${url}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:16px;font-weight:bold;color:${C.carte};text-decoration:none;border-radius:999px;">${escapeHtml(block.button.label)}</a>
</td></tr></table>
<p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:${C.doux};">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${url}</span></p>`;
  }
  if (block.code) {
    const digits = escapeHtml(block.code.value).split('').join('&#8202;');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" style="background:${C.creme};border:1px dashed ${C.terra};border-radius:16px;padding:22px 12px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${C.doux};">${escapeHtml(block.code.caption)}</p>
<p style="margin:0;font-family:${SERIF};font-size:38px;letter-spacing:12px;color:${C.cacao};font-weight:bold;">${digits}</p>
</td></tr></table>`;
  }
  if (block.rows) {
    const rows = block.rows
      .map((row) => {
        const weight = row.total ? 'bold' : 'normal';
        const border = row.total
          ? `border-top:2px solid ${C.cacao};`
          : `border-top:1px solid ${C.filet};`;
        const size = row.total ? '17px' : '15px';
        return `<tr><td style="${border}padding:10px 0;font-size:${size};font-weight:${weight};color:${row.total ? C.cacao : C.texte};">${escapeHtml(row.label)}</td><td align="right" style="${border}padding:10px 0 10px 16px;font-size:${size};font-weight:${weight};color:${C.cacao};white-space:nowrap;">${escapeHtml(row.value)}</td></tr>`;
      })
      .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;font-family:${SANS};">${rows}</table>`;
  }
  if (block.note) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:${C.sable};border-left:4px solid ${C.mangue};border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:${C.cacao};">${escapeHtml(block.note)}</td></tr></table>`;
  }
  return `<p style="margin:0 0 16px;">${escapeHtml(block.paragraph ?? '')}</p>`;
}

function blockText(block: LayoutBlock): string {
  if (block.button) return `${block.button.label} : ${block.button.url}`;
  if (block.code) return `${block.code.caption} : ${block.code.value}`;
  if (block.rows) return block.rows.map((row) => `${row.label} : ${row.value}`).join('\n');
  if (block.note) return block.note;
  return block.paragraph ?? '';
}

/**
 * Gabarit commun aux couleurs du site : en-tête chocolat avec la signature, filet mangue, carte
 * crème, pied de page. Compatible clients de messagerie (tableaux, styles en ligne, police de
 * repli). Produit une version HTML et une version texte.
 */
export function renderLayout(title: string, blocks: LayoutBlock[]): { html: string; text: string } {
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${C.creme};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.creme};padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
<tr><td align="center" style="background:${C.ganache};border-radius:20px 20px 0 0;padding:26px 24px 22px;">
<p style="margin:0;font-family:${SERIF};font-size:21px;color:${C.creme};letter-spacing:0.5px;">Les Secrets de <span style="font-style:italic;color:${C.mangue};font-size:25px;">Diani</span></p>
<p style="margin:6px 0 0;font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#CDB8AA;">Traiteur · Pâtisserie · Formations</p>
</td></tr>
<tr><td style="height:5px;background:${C.mangue};line-height:5px;font-size:0;">&nbsp;</td></tr>
<tr><td style="background:${C.carte};border-radius:0 0 20px 20px;padding:34px 32px 30px;font-family:${SANS};font-size:16px;line-height:1.65;color:${C.texte};">
<h1 style="margin:0 0 22px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:normal;color:${C.cacao};">${escapeHtml(title)}</h1>
${blocks.map(blockHtml).join('\n')}
<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid ${C.filet};font-family:${SERIF};font-style:italic;font-size:16px;color:${C.terra};">À très vite,<br>Diani</p>
</td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.doux};">
Cet e-mail vous a été envoyé automatiquement, merci de ne pas y répondre.<br>Les Secrets de Diani · Fait maison, avec le cœur.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'Les Secrets de Diani',
    '',
    title,
    '',
    ...blocks.map(blockText),
    '',
    'À très vite,',
    'Diani',
    '',
    'Cet e-mail vous a été envoyé automatiquement, merci de ne pas y répondre.',
  ].join('\n');

  return { html, text };
}
