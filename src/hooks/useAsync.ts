import { useCallback, useEffect, useState } from 'react';

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  /** An API error code (see `@/utils/errors`), or null. */
  error: string | null;
  reload: () => void;
};

/**
 * Minimal data-fetching hook handling the three states every screen needs:
 * loading, error and success. Returns an error *code* so the UI can localise it.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
