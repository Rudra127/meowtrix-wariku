import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';
import { createApiClient } from './client';

/** API client that authenticates every request with the current Clerk session. */
export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient((options) => getToken(options)), [getToken]);
}
