'use client';

import { useQuery } from '@tanstack/react-query';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Profile = components['schemas']['ProfileDto'];
export type Address = components['schemas']['AddressDto'];
export type ActiveSession = components['schemas']['SessionViewDto'];

export const queryKeys = {
  profile: ['me'] as const,
  addresses: ['me', 'addresses'] as const,
  sessions: ['me', 'sessions'] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me')),
  });
}

export function useAddresses() {
  return useQuery({
    queryKey: queryKeys.addresses,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me/addresses')),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me/sessions')),
  });
}
