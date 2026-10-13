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
}

/**
 * Gabarit commun : charte crème / terracotta, compatible clients de messagerie
 * (tableaux, styles en ligne). Produit une version HTML et une version texte.
 */
export function renderLayout(title: string, blocks: LayoutBlock[]): { html: string; text: string } {
  const htmlBlocks = blocks
    .map((block) => {
      if (block.button) {
        const url = escapeHtml(block.button.url);
        return `<p style="margin:28px 0;"><a href="${url}" style="background:#9B6155;color:#FFFBF8;padding:14px 26px;border-radius:14px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(block.button.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#7A6B63;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${url}</span></p>`;
      }
      return `<p style="margin:0 0 16px;">${escapeHtml(block.paragraph ?? '')}</p>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F9EEE8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9EEE8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFBF8;border-radius:14px;padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#5A504A;">
<tr><td>
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#5E2F1B;">Les Secrets de Diani</p>
<h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#5E2F1B;">${escapeHtml(title)}</h1>
${htmlBlocks}
<p style="margin:32px 0 0;font-size:13px;color:#7A6B63;">Cet e-mail vous a été envoyé automatiquement, merci de ne pas y répondre.</p>
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
    ...blocks.map((block) =>
      block.button ? `${block.button.label} : ${block.button.url}` : (block.paragraph ?? ''),
    ),
    '',
    'Cet e-mail vous a été envoyé automatiquement, merci de ne pas y répondre.',
  ].join('\n');

  return { html, text };
}
