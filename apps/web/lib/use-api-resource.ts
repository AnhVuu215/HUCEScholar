'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = { key: string | null; data: T | null; error: string };

/**
 * Loads one piece of data for a component and keeps it in step with `key`.
 *
 * - `key` names what to load (e.g. the query as text). A new key aborts the request in flight
 *   and loads again; `null` loads nothing.
 * - `load` gets an AbortSignal and is read when the request starts, so it may close over state.
 * - `describe` turns a failure into the Vietnamese text the component shows.
 *
 * `data` and `error` belong to the current key only: while a new key loads, both are empty, so a
 * stale answer is never shown for a new query. `reload()` clears the data and loads the same key
 * again; `setData` patches the loaded value in place (after a save, for example).
 */
export function useApiResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  describe: (failure: unknown) => string,
) {
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  const describer = useRef(describe);
  useEffect(() => {
    loader.current = load;
    describer.current = describe;
  });
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    loader.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, data, error: '' });
      },
      (failure: unknown) => {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: describer.current(failure) });
      },
    );
    return () => controller.abort();
  }, [key, attempt]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, data: null, error: '' }));
    setAttempt((value) => value + 1);
  }, []);
  const setData = useCallback((update: (current: T | null) => T | null) => {
    setState((current) => ({ ...current, data: update(current.data) }));
  }, []);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : '',
    reload,
    setData,
  };
}
