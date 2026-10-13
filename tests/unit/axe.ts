import axe from 'axe-core';

/**
 * Violations axe d'un fragment rendu. Les règles qui dépendent de la page entière
 * (repères, titre de page, contrastes calculés par le navigateur) sont vérifiées en e2e.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: {
      region: { enabled: false },
      'color-contrast': { enabled: false },
      'landmark-one-main': { enabled: false },
      'page-has-heading-one': { enabled: false },
    },
  });
  return results.violations.map((violation) => `${violation.id} : ${violation.help}`);
}
