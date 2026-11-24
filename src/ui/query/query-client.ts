import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../infra/api/api-client';
export function createQueryClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status >= 500), staleTime: 5000, refetchOnWindowFocus: false }, mutations: { retry: false } } });
}
