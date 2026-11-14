'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  Chips,
  ConfirmDialog,
  Empty,
  ErrorBox,
  FormActions,
  FormGrid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
  Toggle,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { FAQ_CATEGORY } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Faq = components['schemas']['AdminFaqDto'];
type Category = Faq['category'];

function FaqForm({ faq, onDone }: { faq?: Faq; onDone: () => void }) {
  const [category, setCategory] = useState<Category>(faq?.category ?? 'traiteur');
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answerMarkdown ?? '');
  const [published, setPublished] = useState(faq?.published ?? true);
  const save = useAdminMutation(
    async () => {
      if (!question.trim() || !answer.trim())
        throw new Error('La question et la réponse sont obligatoires.');
      const body = {
        category,
        question: question.trim(),
        answerMarkdown: answer.trim(),
        published,
      };
      return faq
        ? unwrap(
            await adminApi.PATCH('/api/v1/admin/faq/{id}', {
              params: { path: { id: faq.id } },
              body,
            }),
          )
        : unwrap(await adminApi.POST('/api/v1/admin/faq', { body }));
    },
    { success: 'Question enregistrée.', invalidate: [['admin', 'faq']] },
  );
  return (
    <Panel title={faq ? 'Modifier la question' : 'Nouvelle question'}>
      <FormGrid>
        <Input label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Select
          label="Rubrique"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          options={Object.entries(FAQ_CATEGORY).map(([value, label]) => ({ value, label }))}
        />
        <Textarea
          label="Réponse"
          rows={5}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          hint="**gras** pour souligner un montant ou un délai."
        />
        <Toggle label="Publiée" checked={published} onChange={setPublished} />
      </FormGrid>
      <FormActions>
        <Btn variant="fantome" onClick={onDone}>
          Fermer
        </Btn>
        <Btn
          variant="primaire"
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onDone })}
        >
          Enregistrer
        </Btn>
      </FormActions>
    </Panel>
  );
}

export default function FaqPage() {
  const faq = useQuery({
    queryKey: ['admin', 'faq'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/faq')),
  });
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);
  const [removing, setRemoving] = useState<Faq | null>(null);
  const togglePublished = useAdminMutation(
    async (item: Faq) =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/faq/{id}', {
          params: { path: { id: item.id } },
          body: { published: !item.published },
        }),
      ),
    {
      success: (item) => (item.published ? 'Question publiée.' : 'Question masquée.'),
      invalidate: [['admin', 'faq']],
    },
  );
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/faq/{id}', {
        params: { path: { id: removing!.id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Question supprimée.', invalidate: [['admin', 'faq']] },
  );
  const rows = (faq.data ?? []).filter((item) => filter === 'all' || item.category === filter);
  const drafts = (faq.data ?? []).filter((item) => !item.published).length;

  return (
    <AdminPage
      title="FAQ"
      subtitle={
        drafts > 0
          ? `${drafts} question(s) en attente de relecture : relisez-les puis publiez-les.`
          : 'Les questions fréquentes affichées sur le site.'
      }
      actions={
        editing === null && (
          <Btn variant="primaire" icon="plus" onClick={() => setEditing('new')}>
            Nouvelle question
          </Btn>
        )
      }
    >
      {editing !== null && (
        <FaqForm
          key={editing === 'new' ? 'new' : editing.id}
          faq={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      <Panel>
        <Chips
          label="Rubrique"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Toutes' },
            ...Object.entries(FAQ_CATEGORY).map(([value, label]) => ({
              value: value as Category,
              label,
              count: (faq.data ?? []).filter((item) => item.category === value).length,
            })),
          ]}
        />
        {faq.isPending && <Loading />}
        {faq.isError && <ErrorBox error={faq.error} />}
        {faq.isSuccess && rows.length === 0 && (
          <Empty icon="question">Aucune question dans cette rubrique.</Empty>
        )}
        <ul role="list" style={{ display: 'grid', gap: '0.6rem' }}>
          {rows.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'grid',
                gap: '0.4rem',
                padding: '0.9rem 1rem',
                border: '1px solid var(--filet-fin)',
                borderRadius: 12,
              }}
            >
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
              >
                <strong style={{ flex: 1, minWidth: '14rem', color: 'var(--cacao)' }}>
                  {item.question}
                </strong>
                <Badge>{FAQ_CATEGORY[item.category]}</Badge>
                {item.published ? (
                  <Badge tone="succes">Publiée</Badge>
                ) : (
                  <Badge tone="attente">À relire</Badge>
                )}
              </div>
              <div
                style={{ fontSize: '0.92rem' }}
                dangerouslySetInnerHTML={{ __html: item.answerHtml }}
              />
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <Btn variant="fantome" icon="crayon" onClick={() => setEditing(item)}>
                  Modifier
                </Btn>
                <Btn variant="fantome" onClick={() => togglePublished.mutate(item)}>
                  {item.published ? 'Masquer' : 'Publier'}
                </Btn>
                <Btn
                  variant="fantome"
                  icon="corbeille"
                  aria-label={`Supprimer : ${item.question}`}
                  onClick={() => setRemoving(item)}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <ConfirmDialog
        open={removing !== null}
        title="Supprimer cette question ?"
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setRemoving(null) })}
      >
        <p>{removing?.question}</p>
      </ConfirmDialog>
    </AdminPage>
  );
}
