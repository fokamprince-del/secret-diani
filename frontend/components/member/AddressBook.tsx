'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import { optionalPhoneField } from '@/lib/forms';
import { CheckboxField, SelectField, TextField } from '../forms/Field';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, FormStatus, Skeleton } from '../ui/States';
import { type Address, queryKeys, useAddresses } from './queries';
import { MemberSection } from './Section';
import styles from './Forms.module.css';

/** Pays proposés (livraison en Europe francophone d'abord) ; code ISO 3166-1 alpha-2. */
export const COUNTRIES = [
  { value: 'FR', label: 'France' },
  { value: 'BE', label: 'Belgique' },
  { value: 'LU', label: 'Luxembourg' },
  { value: 'CH', label: 'Suisse' },
  { value: 'MC', label: 'Monaco' },
  { value: 'DE', label: 'Allemagne' },
  { value: 'ES', label: 'Espagne' },
  { value: 'IT', label: 'Italie' },
  { value: 'NL', label: 'Pays-Bas' },
] as const;

const addressSchema = z.object({
  type: z.enum(['shipping', 'billing']),
  label: z.string().trim().max(50, 'Nom trop long (50 caractères au plus).'),
  firstName: z.string().trim().min(1, 'Indiquez le prénom.').max(100, 'Prénom trop long.'),
  lastName: z.string().trim().min(1, 'Indiquez le nom.').max(100, 'Nom trop long.'),
  line1: z.string().trim().min(3, 'Indiquez l’adresse.').max(200, 'Adresse trop longue.'),
  line2: z.string().trim().max(200, 'Complément trop long.'),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, 'Vérifiez le code postal.'),
  city: z.string().trim().min(1, 'Indiquez la ville.').max(100, 'Nom de ville trop long.'),
  country: z.string().length(2),
  phone: optionalPhoneField,
  isDefault: z.boolean(),
});
type AddressValues = z.infer<typeof addressSchema>;

const FIELDS = [
  'type',
  'label',
  'firstName',
  'lastName',
  'line1',
  'line2',
  'postalCode',
  'city',
  'country',
  'phone',
] as const;

const empty: AddressValues = {
  type: 'shipping',
  label: '',
  firstName: '',
  lastName: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  country: 'FR',
  phone: '',
  isDefault: false,
};

function AddressForm({
  address,
  onDone,
}: {
  address: Address | null;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? {
          type: address.type,
          label: address.label ?? '',
          firstName: address.firstName,
          lastName: address.lastName,
          line1: address.line1,
          line2: address.line2 ?? '',
          postalCode: address.postalCode,
          city: address.city,
          country: address.country,
          phone: address.phone ?? '',
          isDefault: address.isDefault,
        }
      : empty,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    const body = {
      ...values,
      label: values.label || undefined,
      line2: values.line2 || undefined,
      phone: values.phone || undefined,
    };
    try {
      if (address) {
        unwrap(
          await authedApi.PATCH('/api/v1/me/addresses/{id}', {
            params: { path: { id: address.id } },
            body,
          }),
        );
      } else {
        unwrap(await authedApi.POST('/api/v1/me/addresses', { body }));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
      onDone(address ? 'Adresse modifiée.' : 'Adresse ajoutée.');
    } catch (error) {
      const byField = fieldMessages(error);
      for (const field of FIELDS) {
        if (byField[field]) setError(field, { message: byField[field] });
      }
      setFailure(userMessage(error));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
      <SelectField
        label="Type d’adresse"
        options={[
          { value: 'shipping', label: 'Livraison' },
          { value: 'billing', label: 'Facturation' },
        ]}
        {...register('type')}
      />
      <TextField
        label="Nom de l’adresse"
        optional
        hint="Par exemple : maison, bureau."
        error={errors.label?.message}
        {...register('label')}
      />
      <div className={styles.grille}>
        <TextField
          label="Prénom"
          autoComplete="given-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          label="Nom"
          autoComplete="family-name"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>
      <TextField
        label="Adresse"
        autoComplete="address-line1"
        error={errors.line1?.message}
        {...register('line1')}
      />
      <TextField
        label="Complément d’adresse"
        autoComplete="address-line2"
        optional
        error={errors.line2?.message}
        {...register('line2')}
      />
      <div className={styles.grille}>
        <TextField
          label="Code postal"
          autoComplete="postal-code"
          inputMode="text"
          error={errors.postalCode?.message}
          {...register('postalCode')}
        />
        <TextField
          label="Ville"
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register('city')}
        />
      </div>
      <div className={styles.grille}>
        <SelectField
          label="Pays"
          autoComplete="country"
          options={COUNTRIES}
          error={errors.country?.message}
          {...register('country')}
        />
        <TextField
          label="Téléphone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          optional
          hint="Utile au livreur."
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>
      <CheckboxField label="Utiliser par défaut" {...register('isDefault')} />
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div className={styles.actions}>
        <Button type="submit" loading={isSubmitting}>
          {address ? 'Enregistrer l’adresse' : 'Ajouter l’adresse'}
        </Button>
        <Button variant="discret" onClick={() => onDone('')}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function describe(address: Address): string {
  return [address.line1, address.line2, `${address.postalCode} ${address.city}`, address.country]
    .filter(Boolean)
    .join(', ');
}

/** Carnet d'adresses : ajout, modification, suppression, adresse par défaut. */
export function AddressBook() {
  const addresses = useAddresses();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const done = (message: string) => {
    setEditing(null);
    setNotice(message || null);
    requestAnimationFrame(() => addButton.current?.focus());
  };

  const remove = async (address: Address) => {
    setFailure(null);
    try {
      unwrap(
        await authedApi.DELETE('/api/v1/me/addresses/{id}', {
          params: { path: { id: address.id } },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
      setNotice('Adresse supprimée.');
    } catch (error) {
      setFailure(userMessage(error));
    }
  };

  if (addresses.isError) {
    return (
      <ErrorState
        title="Vos adresses n’ont pas pu être chargées"
        action={<Button onClick={() => addresses.refetch()}>Réessayer</Button>}
      >
        <p>{userMessage(addresses.error)}</p>
      </ErrorState>
    );
  }
  if (!addresses.data) return <Skeleton height="12rem" radius="14px" />;

  return (
    <MemberSection id="adresses-titre" title="Adresses enregistrées">
      <FormStatus tone="succes">{notice}</FormStatus>
      <FormStatus tone="erreur">{failure}</FormStatus>
      {addresses.data.length === 0 && editing === null && (
        <EmptyState title="Aucune adresse pour le moment" icon="pin" headingLevel={3}>
          <p>Enregistrez une adresse pour commander plus vite.</p>
        </EmptyState>
      )}
      {addresses.data.length > 0 && (
        <ul role="list" className={styles.liste}>
          {addresses.data.map((address) => (
            <li key={address.id} className={styles.element}>
              {editing !== null && editing !== 'new' && editing.id === address.id ? (
                <AddressForm address={address} onDone={done} />
              ) : (
                <>
                  <div>
                    <p className={styles.elementTitre}>
                      {address.label ||
                        (address.type === 'shipping'
                          ? 'Adresse de livraison'
                          : 'Adresse de facturation')}
                      {address.isDefault && <span className={styles.pastille}>Par défaut</span>}
                    </p>
                    <p className={styles.elementDetail}>
                      {address.firstName} {address.lastName} · {describe(address)}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <Button variant="secondaire" onClick={() => setEditing(address)}>
                      Modifier<span className="visually-hidden"> {describe(address)}</span>
                    </Button>
                    <Button variant="discret" onClick={() => remove(address)}>
                      Supprimer<span className="visually-hidden"> {describe(address)}</span>
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' ? (
        <AddressForm address={null} onDone={done} />
      ) : (
        <div>
          <Button ref={addButton} onClick={() => setEditing('new')}>
            Ajouter une adresse
          </Button>
        </div>
      )}
    </MemberSection>
  );
}
