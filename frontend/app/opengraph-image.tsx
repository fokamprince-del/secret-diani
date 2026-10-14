import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

/**
 * Image de partage par défaut (réseaux sociaux, messageries) pour les pages sans visuel propre :
 * générée au build aux couleurs de la marque, sans photo ni portrait.
 */
export const alt = `${SITE_NAME} : traiteur, formations et boutique`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px 96px',
        background: '#F9EEE8',
        color: '#5E2F1B',
        fontFamily: 'serif',
      }}
    >
      <div style={{ width: 96, height: 3, background: '#B8935A', marginBottom: 40 }} />
      <div style={{ fontSize: 76, lineHeight: 1.1 }}>{SITE_NAME}</div>
      <div style={{ marginTop: 28, fontSize: 36, color: '#5A504A', maxWidth: 900 }}>
        Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire plaisir.
      </div>
    </div>,
    size,
  );
}
