const stateKey = '__hucescholarHistory';
const controllerKey = '__hucescholarHistoryGuard';
type Entry = { group: string; index: number };
type Controller = { guards: Set<() => boolean> };
type GuardWindow = Window & { [controllerKey]?: Controller };
type NavigationWindow = Window & { navigation?: { currentEntry?: { index: number } | null } };

function nativeIndex(): number | undefined {
  const index = (window as NavigationWindow).navigation?.currentEntry?.index;
  return index !== undefined && Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}

function readEntry(state: unknown): Entry | undefined {
  if (!state || typeof state !== 'object') return;
  const value = (state as Record<string, unknown>)[stateKey];
  if (!value || typeof value !== 'object') return;
  const entry = value as Entry;
  if (typeof entry.group === 'string' && Number.isSafeInteger(entry.index)) return entry;
}

// Install before users navigate, including while the reader is clean. Keep one controller per
// document through Strict Mode/HMR; only opaque positions enter history, never private drafts.
export function initializeHistoryLeaveGuard(): Controller {
  const host = window as GuardWindow;
  if (host[controllerKey]) return host[controllerKey];
  const controller: Controller = { guards: new Set() };
  host[controllerKey] = controller;
  let current = readEntry(history.state) ?? {
    group: crypto.randomUUID(),
    index: nativeIndex() ?? 0,
  };
  current = { ...current, index: nativeIndex() ?? current.index };
  let currentState: unknown = history.state;
  let pathname = location.pathname;
  let restoring: Entry | undefined;
  let pendingWrites: Array<() => void> = [];
  const push = history.pushState;
  const replace = history.replaceState;
  const withEntry = (state: unknown, entry: Entry) => ({
    ...(state && typeof state === 'object' ? state : {}),
    [stateKey]: entry,
  });
  replace.call(history, withEntry(history.state, current), '');

  history.pushState = function (state, unused, url) {
    if (restoring) {
      pendingWrites.push(() => history.pushState(state, unused, url));
      return;
    }
    const next = { group: current.group, index: current.index + 1 };
    push.call(this, withEntry(state, next), unused, url);
    current = { ...next, index: nativeIndex() ?? next.index };
    currentState = history.state;
    pathname = location.pathname;
  };
  history.replaceState = function (state, unused, url) {
    if (restoring) {
      pendingWrites.push(() => history.replaceState(state, unused, url));
      return;
    }
    replace.call(this, withEntry(state, current), unused, url);
    currentState = history.state;
    pathname = location.pathname;
  };

  window.addEventListener(
    'popstate',
    (event: PopStateEvent) => {
      let target = readEntry(event.state);
      const index = nativeIndex();
      if (index !== undefined) target = { group: current.group, index };
      // Native fragment entries can have null state. Preserve the previous same-route
      // framework state, and use the browser's actual position rather than guessing direction.
      if (!target && location.pathname === pathname) {
        // Older browsers cannot locate untracked entries. Start a fresh tracked range;
        // never invent a restoration offset that could send the user to the wrong page.
        current = { group: crypto.randomUUID(), index: 0 };
        target = current;
      }
      if (target && !readEntry(event.state) && location.pathname === pathname) {
        replace.call(history, withEntry(currentState, target), '');
      }
      if (!target || target.group !== current.group) return;
      if (restoring) {
        event.stopImmediatePropagation();
        const delta = restoring.index - target.index;
        if (delta) history.go(delta);
        else {
          restoring = undefined;
          // A router commit may have arrived during the round trip. Apply it only after
          // returning, so it cannot overwrite another entry or erase the Forward stack.
          const writes = pendingWrites;
          pendingWrites = [];
          for (const write of writes) write();
        }
        return;
      }
      const delta = current.index - target.index;
      if (
        delta &&
        location.pathname !== pathname &&
        [...controller.guards].some((canLeave) => !canLeave())
      ) {
        // popstate cannot be cancelled. Keep Next's router on the reader while returning to
        // the original entry; pushing a substitute entry would erase the Forward stack.
        event.stopImmediatePropagation();
        restoring = current;
        history.go(delta);
        return;
      }
      current = target;
      currentState = history.state;
      pathname = location.pathname;
    },
    { capture: true },
  );
  return controller;
}

export function registerHistoryLeaveGuard(canLeave: () => boolean): () => void {
  const { guards } = initializeHistoryLeaveGuard();
  guards.add(canLeave);
  return () => {
    guards.delete(canLeave);
  };
}
