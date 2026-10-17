'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Kind = 'highlight' | 'page';
type EditorState = { dirty: boolean; busy: boolean; uncertain: boolean };
type Editor = { read: () => EditorState; discard: () => void };
type Panel = {
  active: Kind;
  open: boolean;
  notice: string;
  register: (kind: Kind, editor: Editor) => () => void;
  activate: (kind: Kind) => boolean;
  begin: (kind: Kind, action: () => void) => boolean;
  close: () => boolean;
};
const Context = createContext<Panel | null>(null);

export function ReaderAnnotationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Kind>('page');
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const editors = useRef(new Map<Kind, Editor>());
  const register = useCallback((kind: Kind, editor: Editor) => {
    editors.current.set(kind, editor);
    return () => {
      if (editors.current.get(kind) === editor) editors.current.delete(kind);
    };
  }, []);
  function replace(action: () => void) {
    const entries = [...editors.current.values()];
    const states = entries.map((editor) => editor.read());
    if (states.some((state) => state.busy || state.uncertain)) {
      setNotice('Hãy chờ lưu xong hoặc thử lại lần lưu chưa xác nhận trước khi chuyển ghi chú.');
      return false;
    }
    if (
      states.some((state) => state.dirty) &&
      !window.confirm('Bỏ bản soạn đang mở để chuyển ghi chú?')
    )
      return false;
    entries.forEach((editor) => editor.discard());
    setNotice('');
    action();
    return true;
  }
  function activate(kind: Kind) {
    if (kind === active && open) return true;
    return replace(() => {
      setActive(kind);
      setOpen(true);
    });
  }
  return (
    <Context.Provider
      value={{
        active,
        open,
        notice,
        register,
        activate,
        begin: (kind, action) =>
          replace(() => {
            setActive(kind);
            setOpen(true);
            action();
          }),
        close: () => replace(() => setOpen(false)),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAnnotationPanel() {
  const panel = useContext(Context);
  if (!panel) throw new Error('Reader annotation panel is required.');
  return panel;
}
export function useAnnotationEditor(kind: Kind, state: EditorState, discard: () => void) {
  const { register } = useAnnotationPanel();
  const read = useEffectEvent(() => state);
  const clear = useEffectEvent(discard);
  useEffect(() => register(kind, { read: () => read(), discard: () => clear() }), [kind, register]);
}

export function ReaderAnnotationPanel({
  highlights,
  notes,
}: {
  highlights: ReactNode;
  notes: ReactNode;
}) {
  const panel = useAnnotationPanel();
  const tabs = useRef<HTMLDivElement>(null);
  return (
    <section className="reader-annotation-panel" aria-label="Ghi chú tài liệu" hidden={!panel.open}>
      <div className="annotation-panel-heading">
        <h3>Ghi chú tài liệu</h3>
        <button
          className="quiet-button"
          onClick={(event) => {
            const reader = event.currentTarget.closest('.library-reader');
            if (panel.close())
              requestAnimationFrame(() => {
                const target =
                  reader?.querySelector<HTMLElement>('[data-reader-reopen]') ??
                  reader?.querySelector<HTMLElement>('.reader-stage') ??
                  reader?.querySelector<HTMLElement>('.reader-document button:not(:disabled)');
                target?.focus();
              });
          }}
        >
          Ẩn ghi chú
        </button>
      </div>
      <div
        ref={tabs}
        className="annotation-tabs"
        role="tablist"
        aria-label="Loại ghi chú"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(
            tabs.current!.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + 1) % 2]?.focus();
        }}
      >
        {(
          [
            ['highlight', 'Đoạn tô'],
            ['page', 'Ghi chú trang'],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            id={`annotation-tab-${kind}`}
            role="tab"
            aria-selected={panel.active === kind}
            aria-controls={`annotation-pane-${kind}`}
            tabIndex={panel.active === kind ? 0 : -1}
            onClick={() => panel.activate(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {panel.notice && (
        <p role="status" className="field-hint">
          {panel.notice}
        </p>
      )}
      <div
        role="tabpanel"
        id="annotation-pane-highlight"
        aria-labelledby="annotation-tab-highlight"
        hidden={panel.active !== 'highlight'}
      >
        {highlights}
      </div>
      <div
        role="tabpanel"
        id="annotation-pane-page"
        aria-labelledby="annotation-tab-page"
        hidden={panel.active !== 'page'}
      >
        {notes}
      </div>
    </section>
  );
}
