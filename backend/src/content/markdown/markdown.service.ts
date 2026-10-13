import { Injectable } from '@nestjs/common';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { AppConfigService } from '../../config/app-config.service';
import { slugify } from './slug';

export interface TocEntry {
  id: string;
  title: string;
  level: 2 | 3;
}

export interface RenderedMarkdown {
  html: string;
  toc: TocEntry[];
  readingMinutes: number;
  /** Texte brut (extraits, données structurées). */
  text: string;
}

/** Vitesse de lecture moyenne en français (mots par minute). */
const WORDS_PER_MINUTE = 200;

const ALLOWED_TAGS = [
  'h2',
  'h3',
  'h4',
  'p',
  'br',
  'strong',
  'em',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'code',
  'pre',
  'hr',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

/**
 * Rendu Markdown → HTML côté serveur, en deux barrières :
 * 1. markdown-it avec le HTML brut DÉSACTIVÉ (une balise <script> saisie reste du texte) ;
 * 2. sanitize-html : liste blanche de balises et d'attributs, schémas d'URL limités,
 *    images uniquement depuis notre médiathèque.
 * Les titres reçoivent un identifiant (table des matières) ; un « # » devient un <h2>
 * (la page porte déjà son unique <h1>).
 */
@Injectable()
export class MarkdownService {
  private readonly md: MarkdownIt.MarkdownIt;
  private readonly mediaBaseUrl: string;
  private readonly siteHost: string;

  constructor(config: AppConfigService) {
    this.md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });
    this.mediaBaseUrl = `${config.get('MEDIA_PUBLIC_BASE_URL').replace(/\/$/, '')}/`;
    this.siteHost = new URL(config.get('PUBLIC_SITE_URL')).host;
  }

  render(markdown: string): RenderedMarkdown {
    const tokens = this.md.parse(markdown, {});
    const toc: TocEntry[] = [];
    const usedIds = new Set<string>();

    tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;
      const level = Math.min(
        Math.max(Number(token.tag.slice(1)) + (token.tag === 'h1' ? 1 : 0), 2),
        4,
      );
      token.tag = `h${level}`;
      const closing = tokens.slice(index).find((t) => t.type === 'heading_close');
      if (closing) closing.tag = token.tag;
      const title = tokens[index + 1]?.content.trim() ?? '';
      const base = slugify(title, 60) || 'section';
      let id = base;
      for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`;
      usedIds.add(id);
      token.attrSet('id', id);
      if (level <= 3 && title) toc.push({ id, title, level: level as 2 | 3 });
    });

    const rawHtml = this.md.renderer.render(tokens, this.md.options, {});
    const html = sanitizeHtml(rawHtml, {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: {
        a: ['href', 'title', 'rel', 'target'],
        img: ['src', 'alt', 'title', 'loading'],
        h2: ['id'],
        h3: ['id'],
        h4: ['id'],
        th: ['align'],
        td: ['align'],
        code: ['class'],
      },
      allowedClasses: { code: [/^language-[a-z0-9-]+$/] },
      allowedSchemes: ['https', 'mailto', 'tel'],
      allowedSchemesByTag: { img: ['https', 'http'] },
      allowProtocolRelative: false,
      disallowedTagsMode: 'escape',
      exclusiveFilter: (frame) =>
        frame.tag === 'img' && !(frame.attribs.src ?? '').startsWith(this.mediaBaseUrl),
      transformTags: {
        a: (tagName, attribs) => {
          const external = this.isExternal(attribs.href ?? '');
          return {
            tagName,
            attribs: external
              ? { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' }
              : { ...attribs },
          };
        },
        img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
      },
    });

    const text = this.toText(html);
    const words = text ? text.split(' ').length : 0;
    return {
      html,
      toc,
      readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
      text,
    };
  }

  /** Texte brut d'un HTML (extraits, meta descriptions). */
  toText(html: string): string {
    return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isExternal(href: string): boolean {
    try {
      const url = new URL(href);
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.host !== this.siteHost;
    } catch {
      return false;
    }
  }
}
