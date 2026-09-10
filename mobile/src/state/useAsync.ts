import { useCallback, useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  reload: (options?: { silent?: boolean }) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Small data-fetching hook. Every screen loads on mount and can pull to
 * refresh, so this is the shape they all need.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        setData(await run());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [run],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, isLoading, isRefreshing, reload, setData };
}
