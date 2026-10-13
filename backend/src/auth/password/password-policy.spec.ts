import { checkPasswordPolicy } from './password-policy';

describe('checkPasswordPolicy', () => {
  it('accepte une phrase de passe longue et originale', () => {
    expect(checkPasswordPolicy('Gâteau-Mangue-Passion-2026!')).toEqual([]);
    expect(checkPasswordPolicy('un ciel bleu sur la ganache')).toEqual([]);
  });

  it('exige 12 caractères (comptés en caractères Unicode) et au plus 128', () => {
    expect(checkPasswordPolicy('court')).toEqual(['doit contenir au moins 12 caractères']);
    expect(checkPasswordPolicy('éééééééééé')).toEqual(['doit contenir au moins 12 caractères']);
    expect(checkPasswordPolicy('x'.repeat(129))).toEqual(['doit contenir au plus 128 caractères']);
  });

  it.each(['password1234', 'Password1234', 'qwertyuiop123', '123456789012'])(
    'refuse un mot de passe courant (%s)',
    (password) => {
      expect(checkPasswordPolicy(password)).toContain('est trop courant ou trop facile à deviner');
    },
  );

  it.each(['aaaaaaaaaaaaaa', 'abcdefghijklmnop', '34567890123456'])(
    'refuse une répétition ou une suite (%s)',
    (password) => {
      expect(checkPasswordPolicy(password)).toContain('est trop courant ou trop facile à deviner');
    },
  );

  it('refuse un mot de passe construit sur l’e-mail ou le nom', () => {
    const context = { email: 'awa.diallo@example.com', firstName: 'Awa', lastName: 'Diallo' };
    expect(checkPasswordPolicy('awa.diallo-secret!', context)).toContain(
      'ne doit pas contenir votre nom ou votre adresse e-mail',
    );
    expect(checkPasswordPolicy('MonNomEstDIALLO#88', context)).toContain(
      'ne doit pas contenir votre nom ou votre adresse e-mail',
    );
    // Les fragments de moins de 4 caractères (ici « Awa ») ne sont pas interdits.
    expect(checkPasswordPolicy('awa-aime-les-layer-cakes', context)).toEqual([]);
  });
});
