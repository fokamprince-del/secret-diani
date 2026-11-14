'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  BtnLink,
  ConfirmDialog,
  ErrorBox,
  FormActions,
  FormGrid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
} from '@/components/admin/kit';
import { MediaPicker } from '@/components/admin/MediaPicker';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/labels';

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const creating = id === 'nouveau';
  const router = useRouter();
  const key = ['admin', 'article', id];
  const article = useQuery({
    queryKey: key,
    enabled: !creating,
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/articles/{id}', { params: { path: { id } } })),
  });
  const categories = useQuery({
    queryKey: ['admin', 'article-categories'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/article-categories')),
  });

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cover, setCover] = useState<{ mediaId: string; alt: string; previewUrl: string | null }[]>(
    [],
  );
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const data = article.data;
    if (!data) return;
    // Formulaire rempli une fois à partir des données chargées (puis édité localement).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(data.title);
    setExcerpt(data.excerpt);
    setBody(data.bodyMarkdown);
    setCategoryId(data.categoryId ?? '');
    setCover(
      data.coverMediaId
        ? [{ mediaId: data.coverMediaId, alt: data.coverAlt, previewUrl: null }]
        : [],
    );
    setSeoTitle(data.seoTitle ?? '');
    setSeoDescription(data.seoDescription ?? '');
  }, [article.data]);

  const payload = () => {
    if (!title.trim() || !excerpt.trim() || !body.trim())
      throw new Error('Titre, chapeau et texte sont obligatoires.');
    return {
      title: title.trim(),
      excerpt: excerpt.trim(),
      bodyMarkdown: body,
      categoryId: categoryId || null,
      coverMediaId: cover[0]?.mediaId ?? null,
      coverAlt: cover[0]?.alt ?? '',
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
    };
  };
  const invalidate = [['admin', 'articles'], key];
  const save = useAdminMutation(
    async () =>
      creating
        ? unwrap(await adminApi.POST('/api/v1/admin/articles', { body: payload() }))
        : unwrap(
            await adminApi.PATCH('/api/v1/admin/articles/{id}', {
              params: { path: { id } },
              body: payload(),
            }),
          ),
    { success: 'Article enregistré.', invalidate },
  );
  const publish = useAdminMutation(
    async (online: boolean) =>
      unwrap(
        online
          ? await adminApi.POST('/api/v1/admin/articles/{id}/publish', {
              params: { path: { id } },
              body: publishAt ? { publishAt: new Date(publishAt).toISOString() } : {},
            })
          : await adminApi.POST('/api/v1/admin/articles/{id}/unpublish', {
              params: { path: { id } },
            }),
      ),
    {
      success: (data) =>
        data.state === 'published'
          ? 'Article publié.'
          : data.state === 'scheduled'
            ? 'Publication programmée.'
            : 'Article repassé en brouillon.',
      invalidate,
    },
  );
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/articles/{id}', {
        params: { path: { id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Article supprimé.', invalidate },
  );

  if (!creating && article.isPending) return <Loading />;
  if (article.isError) return <ErrorBox error={article.error} />;
  const data = article.data;
  const submit = () =>
    save.mutate(undefined, {
      onSuccess: (saved) => creating && router.replace(`/admin/contenus/articles/${saved.id}`),
    });

  return (
    <AdminPage
      back={{ href: '/admin/contenus/articles', label: 'Conseils & astuces' }}
      title={creating ? 'Nouvel article' : title}
      subtitle={
        data && (
          <Badge
            tone={
              data.state === 'published'
                ? 'succes'
                : data.state === 'scheduled'
                  ? 'attente'
                  : 'eteint'
            }
          >
            {data.state === 'published'
              ? `Publié le ${formatDateTime(data.publishedAt)}`
              : data.state === 'scheduled'
                ? `Programmé le ${formatDateTime(data.publishedAt)}`
                : 'Brouillon'}
          </Badge>
        )
      }
      actions={
        <>
          {data?.state === 'published' && (
            <BtnLink href={`/conseils/${data.slug}`} external icon="externe">
              Voir
            </BtnLink>
          )}
          <Btn variant="primaire" icon="check" loading={save.isPending} onClick={submit}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <Panel title="Rédaction">
        <FormGrid>
          <Input wide label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            label="Chapeau"
            rows={2}
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            hint="Deux phrases qui donnent envie de lire, reprises sur la carte de l’article."
          />
          <Textarea
            label="Texte"
            rows={22}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            hint="## Intertitre (sommaire automatique) · **gras** · - liste · [lien](https://…)"
            style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.9rem' }}
          />
          <Select
            label="Catégorie"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: 'Sans catégorie' },
              ...(categories.data ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
        </FormGrid>
      </Panel>
      <Panel title="Image de couverture">
        <MediaPicker value={cover} onChange={(value) => setCover(value.slice(-1))} max={1} />
      </Panel>
      <Panel title="Référencement">
        <FormGrid>
          <Input
            label="Titre pour Google"
            maxLength={70}
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            hint={`${seoTitle.length}/70`}
          />
          <Input
            label="Description pour Google"
            maxLength={160}
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            hint={`${seoDescription.length}/160`}
          />
        </FormGrid>
      </Panel>
      {!creating && data && (
        <Panel title="Publication">
          {data.state === 'draft' ? (
            <FormGrid>
              <Input
                label="Programmer (facultatif)"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                hint="Vide : publié tout de suite."
              />
            </FormGrid>
          ) : null}
          <FormActions>
            <Btn variant="danger" icon="corbeille" onClick={() => setDeleting(true)}>
              Supprimer
            </Btn>
            {data.state === 'draft' ? (
              <Btn
                variant="primaire"
                loading={publish.isPending}
                onClick={() => publish.mutate(true)}
              >
                {publishAt ? 'Programmer' : 'Publier maintenant'}
              </Btn>
            ) : (
              <Btn loading={publish.isPending} onClick={() => publish.mutate(false)}>
                Repasser en brouillon
              </Btn>
            )}
          </FormActions>
        </Panel>
      )}
      <ConfirmDialog
        open={deleting}
        title={`Supprimer « ${title} » ?`}
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(undefined, { onSuccess: () => router.replace('/admin/contenus/articles') })
        }
      />
    </AdminPage>
  );
}
