import type { ValidationError } from 'class-validator';
import { flattenValidationErrors, translateConstraint } from './validation-messages';

describe('translateConstraint', () => {
  it('traduit les contraintes connues', () => {
    expect(translateConstraint('isEmail', 'email must be an email')).toBe(
      'doit être une adresse e-mail valide',
    );
    expect(translateConstraint('whitelistValidation', 'property x should not exist')).toBe(
      'ce champ n’est pas autorisé',
    );
  });

  it('reprend la valeur numérique de la contrainte', () => {
    expect(
      translateConstraint('minLength', 'password must be longer than or equal to 12 characters'),
    ).toBe('doit contenir au moins 12 caractères');
    expect(translateConstraint('max', 'quantity must not be greater than 99')).toBe(
      'doit être inférieur ou égal à 99',
    );
  });

  it('utilise les messages personnalisés français préfixés « fr: »', () => {
    expect(translateConstraint('isStrongPassword', 'fr: mot de passe trop courant')).toBe(
      'mot de passe trop courant',
    );
  });

  it('ne renvoie jamais un message anglais inconnu', () => {
    expect(translateConstraint('customThing', 'something went wrong')).toBe('valeur invalide');
  });
});

describe('flattenValidationErrors', () => {
  it('aplatit les erreurs imbriquées avec un chemin pointé', () => {
    const errors: ValidationError[] = [
      {
        property: 'address',
        children: [
          {
            property: 'city',
            constraints: { isNotEmpty: 'city should not be empty' },
            children: [],
          },
        ],
      },
      { property: 'role', constraints: { whitelistValidation: 'property role should not exist' } },
    ];
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'address.city', messages: ['ce champ ne doit pas être vide'] },
      { field: 'role', messages: ['ce champ n’est pas autorisé'] },
    ]);
  });
});
