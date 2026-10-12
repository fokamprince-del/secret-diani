import type { AppConfigService } from '../../config/app-config.service';
import { MarkdownService } from './markdown.service';
import { slugify } from './slug';

const config = {
  get: (key: string) =>
    key === 'PUBLIC_SITE_URL'
      ? 'https://lessecretsdediani.fr'
      : 'https://medias.lessecretsdediani.fr',
} as AppConfigService;

const md = new MarkdownService(config);

/** Vrai si le HTML contient un élément ou un attribut exécutable (pas du simple texte échappé). */
function isDangerous(html: string): boolean {
  return (
    /<(script|iframe|style|object|embed|svg|form)/i.test(html) ||
    /<[^>]+\son[a-z]+\s*=/i.test(html) ||
    /<[^>]+\s(href|src)\s*=\s*"(javascript|data|vbscript):/i.test(html)
  );
}

describe('MarkdownService — assainissement (aucune injection HTML)', () => {
  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://evil.example"></iframe>',
    '[clic](javascript:alert(1))',
    '[clic](JaVaScRiPt:alert(1))',
    '[clic](data:text/html;base64,PHNjcmlwdD4=)',
    '<a href="https://x.fr" onclick="vol()">x</a>',
    '<style>body{display:none}</style>',
    '<svg onload=alert(1)>',
    '![x](javascript:alert(1))',
    '<textarea/><script>alert(1)</script>',
  ])('neutralise %s', (input) => {
    const { html } = md.render(input);
    expect(isDangerous(html)).toBe(false);
  });

  it('le HTML brut saisi reste visible comme texte (échappé)', () => {
    expect(md.render('<b>gras</b>').html.trim()).toBe('<p>&lt;b&gt;gras&lt;/b&gt;</p>');
  });

  it('n’accepte les images que depuis la médiathèque', () => {
    const html = md.render(
      '![ok](https://medias.lessecretsdediani.fr/media/a/640.webp)\n\n![pistage](https://evil.example/pixel.gif)',
    ).html;
    expect(html).toContain('src="https://medias.lessecretsdediani.fr/media/a/640.webp"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('evil.example');
  });

  it('liens externes : nouvel onglet sans transmission du référent ; liens internes inchangés', () => {
    const html = md.render(
      '[Stripe](https://stripe.com) et [nos kits](https://lessecretsdediani.fr/boutique)',
    ).html;
    expect(html).toContain(
      '<a href="https://stripe.com" rel="noopener noreferrer nofollow" target="_blank">',
    );
    expect(html).toContain('<a href="https://lessecretsdediani.fr/boutique">');
  });
});

describe('MarkdownService — structure', () => {
  const source = [
    '# Titre principal',
    'Intro.',
    '## Les ingrédients',
    'Texte.',
    '### Le beurre',
    '## Les ingrédients',
    '##### Détail',
  ].join('\n\n');

  it('jamais de <h1> (la page porte le sien) ; titres ancrés et uniques', () => {
    const { html, toc } = md.render(source);
    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2 id="titre-principal">Titre principal</h2>');
    expect(html).toContain('<h2 id="les-ingredients-2">');
    expect(html).toContain('<h4 id="detail">');
    expect(toc).toEqual([
      { id: 'titre-principal', title: 'Titre principal', level: 2 },
      { id: 'les-ingredients', title: 'Les ingrédients', level: 2 },
      { id: 'le-beurre', title: 'Le beurre', level: 3 },
      { id: 'les-ingredients-2', title: 'Les ingrédients', level: 2 },
    ]);
  });

  it('calcule le temps de lecture (200 mots/min, minimum 1)', () => {
    expect(md.render('court').readingMinutes).toBe(1);
    expect(md.render(Array.from({ length: 1000 }, () => 'mot').join(' ')).readingMinutes).toBe(5);
  });

  it('extrait le texte brut', () => {
    expect(md.render('**Crème** au _beurre_').text).toBe('Crème au beurre');
  });
});

describe('slugify', () => {
  it.each([
    ['Crème au beurre : 5 astuces !', 'creme-au-beurre-5-astuces'],
    ['  Œufs & sœurs  ', 'oeufs-soeurs'],
    ['Pâte à choux — réussie', 'pate-a-choux-reussie'],
    ['!!!', ''],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('respecte la longueur maximale sans tiret final', () => {
    expect(slugify('a-'.repeat(100), 9)).toBe('a-a-a-a-a');
  });
});
