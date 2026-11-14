'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  Chips,
  ErrorBox,
  FormActions,
  Input,
  Loading,
  Panel,
  Textarea,
  Toggle,
} from '@/components/admin/kit';
import { MediaPicker } from '@/components/admin/MediaPicker';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { centsToEuros, eurosToCents, formatDateTime } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Setting = components['schemas']['SettingDto'];
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
interface Schema {
  type?: string | string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  anyOf?: Schema[];
  maxLength?: number;
  format?: string;
  description?: string;
}

/** Libellés des champs les plus courants (le reste garde son nom technique, lisible). */
const FIELD_LABELS: Record<string, string> = {
  enabled: 'Activé',
  text: 'Texte',
  link: 'Lien',
  title: 'Titre',
  body: 'Texte',
  description: 'Description',
  href: 'Lien',
  label: 'Libellé',
  name: 'Nom',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
  siret: 'SIRET',
  address: 'Adresse',
  vatNumber: 'N° de TVA',
  vatMention: 'Mention TVA',
  legalForm: 'Forme juridique',
  email: 'E-mail',
  phone: 'Téléphone',
};

const GROUPS = [
  { value: 'site', label: 'Site' },
  { value: 'home', label: 'Accueil' },
  { value: 'catering', label: 'Traiteur' },
  { value: 'shop', label: 'Boutique' },
  { value: 'features', label: 'Fonctionnalités' },
  { value: 'legal', label: 'Mentions légales' },
] as const;

function baseType(schema: Schema): string {
  if (schema.anyOf) {
    const concrete = schema.anyOf.find((option) => option.type !== 'null');
    return concrete ? baseType(concrete) : 'string';
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  return type ?? 'string';
}

function resolved(schema: Schema): Schema {
  return schema.anyOf?.find((option) => option.type !== 'null') ?? schema;
}

function ValueEditor({
  name,
  label,
  schema,
  value,
  onChange,
}: {
  name: string;
  label: string;
  schema: Schema;
  value: Json;
  onChange: (value: Json) => void;
}) {
  const type = baseType(schema);
  const inner = resolved(schema);
  if (type === 'boolean')
    return <Toggle label={label} checked={Boolean(value)} onChange={onChange} />;
  if (type === 'number' || type === 'integer') {
    if (name.endsWith('_cents')) {
      return (
        <Input
          label={`${label} (€)`}
          inputMode="decimal"
          value={centsToEuros(value as number)}
          onChange={(e) => onChange(eurosToCents(e.target.value) ?? 0)}
        />
      );
    }
    return (
      <Input
        label={label}
        inputMode="numeric"
        value={value === null ? '' : String(value)}
        onChange={(e) =>
          onChange(e.target.value === '' ? 0 : Number(e.target.value.replace(/[^\d-]/g, '')))
        }
      />
    );
  }
  if (type === 'array') {
    const items = (Array.isArray(value) ? value : []) as Json[];
    const itemSchema = inner.items ?? { type: 'string' };
    if (baseType(itemSchema) === 'string') {
      return (
        <Textarea
          label={`${label} (une ligne par élément)`}
          rows={Math.max(3, items.length + 1)}
          value={items.join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n'))}
        />
      );
    }
    return (
      <fieldset
        style={{
          display: 'grid',
          gap: '0.75rem',
          border: '1px solid var(--filet-fin)',
          borderRadius: 12,
          padding: '0.75rem 1rem',
        }}
      >
        <legend style={{ fontWeight: 600, color: 'var(--cacao)', padding: '0 0.3rem' }}>
          {label}
        </legend>
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gap: '0.6rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px dashed var(--filet)',
            }}
          >
            <ValueEditor
              name={`${name}.${index}`}
              label={`Élément ${index + 1}`}
              schema={itemSchema}
              value={item}
              onChange={(next) =>
                onChange(items.map((current, i) => (i === index ? next : current)))
              }
            />
            <div>
              <Btn
                variant="fantome"
                icon="corbeille"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                Retirer
              </Btn>
            </div>
          </div>
        ))}
      </fieldset>
    );
  }
  if (type === 'object' && inner.properties) {
    const object = (
      value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    ) as Record<string, Json>;
    return (
      <fieldset style={{ display: 'grid', gap: '0.75rem', border: 0, padding: 0, margin: 0 }}>
        <legend className="visually-hidden">{label}</legend>
        {Object.entries(inner.properties).map(([key, child]) => (
          <ValueEditor
            key={key}
            name={key}
            label={FIELD_LABELS[key] ?? key}
            schema={child}
            value={object[key] ?? null}
            onChange={(next) => onChange({ ...object, [key]: next })}
          />
        ))}
      </fieldset>
    );
  }
  const text = value === null || value === undefined ? '' : String(value);
  return (inner.maxLength ?? 0) > 160 || text.length > 80 ? (
    <Textarea label={label} rows={3} value={text} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <Input label={label} value={text} onChange={(e) => onChange(e.target.value)} />
  );
}

function SettingCard({ setting }: { setting: Setting }) {
  const [value, setValue] = useState<Json>(setting.value as Json);
  const [hero, setHero] = useState<{ mediaId: string; alt: string; previewUrl: string | null }[]>(
    typeof setting.value === 'string' && setting.value
      ? [{ mediaId: setting.value, alt: 'Image actuelle', previewUrl: null }]
      : [],
  );
  const isHero = setting.key === 'home.hero_image_id';
  const save = useAdminMutation(
    async () => {
      const cleaned =
        Array.isArray(value) && value.every((item) => typeof item === 'string')
          ? (value as string[]).map((line) => line.trim()).filter(Boolean)
          : value;
      return unwrap(
        await adminApi.PUT('/api/v1/admin/settings/{key}', {
          params: { path: { key: setting.key } },
          body: { value: (isHero ? (hero[0]?.mediaId ?? null) : cleaned) as never },
        }),
      );
    },
    {
      success: 'Paramètre enregistré : visible sur le site sous quelques secondes.',
      invalidate: [['admin', 'settings']],
    },
  );
  const reset = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.DELETE('/api/v1/admin/settings/{key}', {
          params: { path: { key: setting.key } },
        }),
      ),
    { success: 'Valeur par défaut rétablie.', invalidate: [['admin', 'settings']] },
  );
  return (
    <Panel
      title={setting.description}
      actions={
        setting.isDefault ? (
          <Badge>Par défaut</Badge>
        ) : (
          <Badge tone="info">Personnalisé · {formatDateTime(setting.updatedAt)}</Badge>
        )
      }
    >
      {isHero ? (
        <MediaPicker value={hero} onChange={(next) => setHero(next.slice(-1))} max={1} />
      ) : (
        <ValueEditor
          name={setting.key.split('.').pop() ?? setting.key}
          label="Valeur"
          schema={setting.schema as Schema}
          value={value}
          onChange={setValue}
        />
      )}
      <FormActions>
        {!setting.isDefault && (
          <Btn
            variant="fantome"
            loading={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, { onSuccess: (fresh) => setValue(fresh.value as Json) })
            }
          >
            Revenir à la valeur par défaut
          </Btn>
        )}
        <Btn variant="primaire" loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Enregistrer
        </Btn>
      </FormActions>
    </Panel>
  );
}

export default function SettingsPage() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]['value']>('site');
  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/settings')),
  });
  const rows = (settings.data ?? []).filter((setting) => setting.group === group);
  return (
    <AdminPage
      title="Paramètres du site"
      subtitle="Textes, numéros, acomptes, ouverture de la boutique… Une valeur incorrecte est refusée avec une explication."
    >
      <Chips
        label="Rubrique"
        value={group}
        onChange={setGroup}
        options={GROUPS.map((item) => ({ ...item }))}
      />
      {settings.isPending && <Loading />}
      {settings.isError && <ErrorBox error={settings.error} retry={() => settings.refetch()} />}
      {rows.map((setting) => (
        <SettingCard key={`${setting.key}-${setting.updatedAt}`} setting={setting} />
      ))}
    </AdminPage>
  );
}
