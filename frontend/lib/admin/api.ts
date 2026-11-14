'use client';

import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifyError, useToast } from '@/components/admin/kit';
import { authedApi } from '../api/authed';
import { unwrap } from '../api/client';

/** Client de l'API d'administration (jeton d'accès en en-tête, renouvelé au besoin). */
export const adminApi = authedApi;
export { unwrap };

/**
 * Mutation du back-office : message de réussite, message d'erreur de l'API (en français),
 * puis rafraîchissement des listes concernées.
 */
export function useAdminMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  options: { success?: string | ((output: TOutput) => string); invalidate?: QueryKey[] } = {},
) {
  const client = useQueryClient();
  const notify = useToast();
  const notifyError = useNotifyError();
  return useMutation({
    mutationFn,
    onSuccess: async (output) => {
      if (options.success) {
        notify(typeof options.success === 'function' ? options.success(output) : options.success);
      }
      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
    onError: notifyError,
  });
}
