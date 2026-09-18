import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useApi } from '@/api/useApi';

/**
 * The backend's user record (Mongo), created on first call.
 * For identity fields in the UI you can also use Clerk's `useUser()` directly.
 */
export function useCurrentUser() {
  const api = useApi();
  const { isSignedIn, userId } = useAuth();
  return useQuery({
    queryKey: [...queryKeys.me, userId],
    queryFn: async () => (await authApi.me(api)).user,
    enabled: !!isSignedIn,
  });
}
