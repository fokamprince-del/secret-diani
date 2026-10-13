'use client';

/**
 * Erreur dans le gabarit racine : page autonome (ni styles globaux ni polices disponibles),
 * donc styles en ligne minimaux aux couleurs de la marque.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#F9EEE8',
          color: '#5A504A',
          fontFamily: 'Georgia, serif',
          lineHeight: 1.6,
        }}
      >
        <title>Service momentanément indisponible · Les Secrets de Diani</title>
        <main style={{ maxWidth: '36rem' }}>
          <h1 style={{ color: '#5E2F1B', fontWeight: 500 }}>
            Le site est momentanément indisponible.
          </h1>
          <p>Un incident nous empêche d’afficher la page. Réessayez dans quelques instants.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 48,
              marginTop: 16,
              padding: '12px 24px',
              border: 0,
              borderRadius: 999,
              background: '#9B6155',
              color: '#FFFBF8',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
