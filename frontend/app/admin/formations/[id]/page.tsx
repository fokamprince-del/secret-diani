'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  ConfirmDialog,
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
import { MediaPicker } from '@/components/admin/MediaPicker';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import type { components } from '@/lib/api/schema';

type Lesson = components['schemas']['AdminLessonDto'];
type Course = components['schemas']['AdminCourseDto'];

function LessonEditor({
  lesson,
  onClose,
  onSaved,
}: {
  lesson: Lesson;
  onClose: () => void;
  onSaved: (course: Course) => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? '');
  const [videoId, setVideoId] = useState(lesson.videoId ?? '');
  const [minutes, setMinutes] = useState(
    lesson.videoDurationSeconds ? String(Math.round(lesson.videoDurationSeconds / 60)) : '',
  );
  const [tips, setTips] = useState(lesson.tipsMarkdown);
  const [freePreview, setFreePreview] = useState(lesson.freePreview);
  const [published, setPublished] = useState(lesson.published);
  const save = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/courses/lessons/{id}', {
          params: { path: { id: lesson.id } },
          body: {
            title: title.trim(),
            summary: summary.trim() || null,
            videoId: videoId.trim() || null,
            videoDurationSeconds: minutes ? Number(minutes) * 60 : null,
            tipsMarkdown: tips,
            freePreview,
            published,
          },
        }),
      ),
    { success: 'Leçon enregistrée.' },
  );
  return (
    <div
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '1rem',
        border: '1px dashed var(--nude)',
        borderRadius: 12,
        background: 'var(--creme-clair)',
      }}
    >
      <FormGrid>
        <Input label="Titre de la leçon" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Vidéo (identifiant Bunny Stream)"
          value={videoId}
          onChange={(e) => setVideoId(e.target.value)}
          hint="Copiez l’identifiant (GUID) de la vidéo dans Bunny Stream."
        />
        <Input
          label="Durée (minutes)"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
        />
        <Textarea
          label="Résumé"
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <Textarea
          label="Astuces & recette"
          rows={6}
          value={tips}
          onChange={(e) => setTips(e.target.value)}
        />
        <Toggle
          label="Aperçu gratuit (visible sans acheter)"
          checked={freePreview}
          onChange={setFreePreview}
        />
        <Toggle label="Leçon publiée" checked={published} onChange={setPublished} />
      </FormGrid>
      <FormActions>
        <Btn variant="fantome" onClick={onClose}>
          Fermer
        </Btn>
        <Btn
          variant="primaire"
          loading={save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: (course) => {
                onSaved(course);
                onClose();
              },
            })
          }
        >
          Enregistrer la leçon
        </Btn>
      </FormActions>
    </div>
  );
}

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const key = ['admin', 'course', id];
  const course = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/courses/{id}', { params: { path: { id } } })),
  });
  const packs = useQuery({
    queryKey: ['admin', 'packs'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/courses/packs')),
  });
  const setCourse = (data: Course) => client.setQueryData(key, data);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [packId, setPackId] = useState('');
  const [featured, setFeatured] = useState(false);
  const [cover, setCover] = useState<{ mediaId: string; alt: string; previewUrl: string | null }[]>(
    [],
  );
  const [newModule, setNewModule] = useState('');
  const [newLesson, setNewLesson] = useState<Record<string, string>>({});
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const data = course.data;
    if (!data) return;
    // Formulaire rempli une fois à partir des données chargées (puis édité localement).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(data.title);
    setSummary(data.summary);
    setDescription(data.descriptionMarkdown);
    setPackId(data.packId);
    setFeatured(data.featured);
    setCover(
      data.coverMediaId
        ? [{ mediaId: data.coverMediaId, alt: data.coverAlt, previewUrl: null }]
        : [],
    );
  }, [course.data]);

  const invalidate = [['admin', 'courses']];
  const save = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/courses/{id}', {
          params: { path: { id } },
          body: {
            title: title.trim(),
            summary: summary.trim(),
            descriptionMarkdown: description,
            packId,
            featured,
            coverMediaId: cover[0]?.mediaId ?? null,
            coverAlt: cover[0]?.alt ?? '',
          },
        }),
      ),
    { success: 'Formation enregistrée.', invalidate },
  );
  const publish = useAdminMutation(
    async (online: boolean) =>
      unwrap(
        online
          ? await adminApi.POST('/api/v1/admin/courses/{id}/publish', { params: { path: { id } } })
          : await adminApi.POST('/api/v1/admin/courses/{id}/unpublish', {
              params: { path: { id } },
            }),
      ),
    {
      success: (data) =>
        data.status === 'published' ? 'Formation en ligne.' : 'Formation repassée en brouillon.',
      invalidate,
    },
  );
  const addModule = useAdminMutation(
    async () => {
      if (!newModule.trim()) throw new Error('Indiquez le titre du module.');
      return unwrap(
        await adminApi.POST('/api/v1/admin/courses/{id}/modules', {
          params: { path: { id } },
          body: { title: newModule.trim() },
        }),
      );
    },
    { success: 'Module ajouté.' },
  );
  const addLesson = useAdminMutation(
    async (moduleId: string) => {
      const lessonTitle = newLesson[moduleId]?.trim();
      if (!lessonTitle) throw new Error('Indiquez le titre de la leçon.');
      return unwrap(
        await adminApi.POST('/api/v1/admin/courses/modules/{id}/lessons', {
          params: { path: { id: moduleId } },
          body: { title: lessonTitle, tipsMarkdown: '', freePreview: false, published: false },
        }),
      );
    },
    { success: 'Leçon ajoutée (non publiée).' },
  );
  const removeLesson = useAdminMutation(
    async (lessonId: string) =>
      unwrap(
        await adminApi.DELETE('/api/v1/admin/courses/lessons/{id}', {
          params: { path: { id: lessonId } },
        }),
      ),
    { success: 'Leçon supprimée.' },
  );
  const removeCourse = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/courses/{id}', {
        params: { path: { id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Formation supprimée.', invalidate },
  );

  if (course.isPending) return <Loading />;
  if (course.isError) return <ErrorBox error={course.error} retry={() => course.refetch()} />;
  const data = course.data;
  const online = data.status === 'published';

  return (
    <AdminPage
      back={{ href: '/admin/formations', label: 'Formations' }}
      title={data.title}
      subtitle={
        online ? <Badge tone="succes">En ligne</Badge> : <Badge tone="eteint">Brouillon</Badge>
      }
      actions={
        <>
          <Btn
            loading={publish.isPending}
            onClick={() => publish.mutate(!online, { onSuccess: setCourse })}
          >
            {online ? 'Repasser en brouillon' : 'Mettre en ligne'}
          </Btn>
          <Btn
            variant="primaire"
            icon="check"
            loading={save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: setCourse })}
          >
            Enregistrer
          </Btn>
        </>
      }
    >
      <Panel title="Présentation">
        <FormGrid>
          <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select
            label="Pack"
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            options={(packs.data ?? []).map((pack) => ({ value: pack.id, label: pack.name }))}
          />
          <Textarea
            label="Résumé (carte de la formation)"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <Textarea
            label="Description complète"
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Toggle label="Mise en avant sur l’accueil" checked={featured} onChange={setFeatured} />
        </FormGrid>
        <h3 style={{ fontSize: '1rem' }}>Image de couverture</h3>
        <MediaPicker value={cover} onChange={(value) => setCover(value.slice(-1))} max={1} />
      </Panel>

      <Panel title="Programme">
        {data.modules.map((module) => (
          <div
            key={module.id}
            style={{
              display: 'grid',
              gap: '0.6rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--filet-fin)',
            }}
          >
            <h3 style={{ fontSize: '1.05rem' }}>
              {module.position + 1}. {module.title}
            </h3>
            <ol role="list" style={{ display: 'grid', gap: '0.4rem' }}>
              {module.lessons.map((lesson) => (
                <li key={lesson.id} style={{ display: 'grid', gap: '0.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: '12rem' }}>
                      {lesson.title} {!lesson.published && <Badge tone="eteint">Non publiée</Badge>}{' '}
                      {lesson.freePreview && <Badge tone="info">Aperçu gratuit</Badge>}{' '}
                      {!lesson.videoId && <Badge tone="attente">Sans vidéo</Badge>}
                    </span>
                    <Btn
                      variant="fantome"
                      icon="crayon"
                      onClick={() =>
                        setEditingLesson(editingLesson === lesson.id ? null : lesson.id)
                      }
                    >
                      Modifier
                    </Btn>
                    <Btn
                      variant="fantome"
                      icon="corbeille"
                      aria-label={`Supprimer ${lesson.title}`}
                      onClick={() => removeLesson.mutate(lesson.id, { onSuccess: setCourse })}
                    />
                  </div>
                  {editingLesson === lesson.id && (
                    <LessonEditor
                      lesson={lesson}
                      onClose={() => setEditingLesson(null)}
                      onSaved={setCourse}
                    />
                  )}
                </li>
              ))}
            </ol>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '14rem' }}>
                <Input
                  label="Nouvelle leçon"
                  value={newLesson[module.id] ?? ''}
                  onChange={(e) => setNewLesson((all) => ({ ...all, [module.id]: e.target.value }))}
                />
              </div>
              <Btn
                icon="plus"
                onClick={() =>
                  addLesson.mutate(module.id, {
                    onSuccess: (updated) => {
                      setCourse(updated);
                      setNewLesson((all) => ({ ...all, [module.id]: '' }));
                    },
                  })
                }
              >
                Ajouter
              </Btn>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '14rem' }}>
            <Input
              label="Nouveau module"
              value={newModule}
              onChange={(e) => setNewModule(e.target.value)}
            />
          </div>
          <Btn
            icon="plus"
            onClick={() =>
              addModule.mutate(undefined, {
                onSuccess: (updated) => {
                  setCourse(updated);
                  setNewModule('');
                },
              })
            }
          >
            Ajouter un module
          </Btn>
        </div>
      </Panel>

      <FormActions>
        <Btn variant="danger" icon="corbeille" onClick={() => setDeleting(true)}>
          Supprimer la formation
        </Btn>
      </FormActions>
      <ConfirmDialog
        open={deleting}
        title={`Supprimer « ${data.title} » ?`}
        confirmLabel="Supprimer"
        danger
        loading={removeCourse.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          removeCourse.mutate(undefined, { onSuccess: () => router.replace('/admin/formations') })
        }
      >
        <p>
          Les élèves perdent l’accès à son contenu. Préférez « Repasser en brouillon » si vous
          hésitez.
        </p>
      </ConfirmDialog>
    </AdminPage>
  );
}
