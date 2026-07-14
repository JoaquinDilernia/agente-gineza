import { useState, useEffect, useCallback } from 'react';

// Fetch + polling cada 30s + refetch al volver el foco. Devuelve { data, error, loading, reload }.
export function usePolling(fn, deps = [], intervalMs = 30_000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
    const id = setInterval(reload, intervalMs);
    window.addEventListener('focus', reload);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', reload);
    };
  }, [reload, intervalMs]);

  return { data, error, loading, reload };
}
