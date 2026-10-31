'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  PDFPageProxy,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist';
import { canvasRatio, readerViewport } from '../../lib/pdf-viewport';
import { ContinuousPages } from './reader-continuous';
import { ReaderThumbnails } from './reader-thumbnails';
import { libraryVersion, libraryError, pdfMissing, type LibraryItem } from '../../lib/library';
import { ReaderNotes } from './reader-notes';
import { ReaderNotebook } from './reader-notebook';
import { ReaderFind } from './reader-find';
import { ReaderOutline } from './reader-outline';
import { pdfTextParts } from '../../lib/pdf-find';
import type { AnnotationItem } from '../../lib/annotations';
import { positionToViewport, quadBounds } from '../../lib/highlight-geometry';
import { useReadingProgress } from './use-reading-progress';
import { SaveMaterial } from './save-material';
import { ReaderReport } from './reader-report';
import { ScheduleReading } from '../calendar/schedule-reading';
import { CurrentVersionNotice } from './current-version-notice';
import { ReaderHighlights } from './reader-highlights';
import type { HighlightSurface } from '../../lib/highlight-geometry';
import { SelectField } from '../ui/select-field';
import { useWorkspaceProfile } from '../auth/workspace-profile-context';
import { accountPreferences, defaultReaderPreferences } from '../../lib/account';
import {
  ReaderAnnotationPanel,
  ReaderAnnotationProvider,
  useAnnotationPanel,
} from './reader-annotation-panel';

export function LibraryReader({ id, initialPage }: { id: string; initialPage?: number | null }) {
  const { user } = useWorkspaceProfile();
  return (
    <ReaderAnnotationProvider key={`${user.id}:${id}`}>
      <LibraryReaderContent id={id} initialPage={initialPage} />
    </ReaderAnnotationProvider>
  );
}
type Layout = 'single' | 'scroll';
/** Per-browser convenience: the last layout chosen, not an account preference. */
const LAYOUT_KEY = 'hucescholar:reader-layout';
function storedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'scroll' ? 'scroll' : 'single';
  } catch {
    return 'single';
  }
}
function LibraryReaderContent({ id, initialPage }: { id: string; initialPage?: number | null }) {
  const { user } = useWorkspaceProfile();
  const panel = useAnnotationPanel();
  const initializePanel = panel.initializeOpen;
  const [defaultColor, setDefaultColor] = useState(defaultReaderPreferences.highlightColor);
  const [preferencesError, setPreferencesError] = useState(false),
    [preferencesAttempt, setPreferencesAttempt] = useState(0);
  const zoomTouched = useRef(false),
    zoomInitialized = useRef(false);
  const [focusMode, setFocusMode] = useState(false);
  const [tool, setTool] = useState<'find' | 'outline' | 'pages' | null>(null);
  const [layout, setLayout] = useState<Layout>(storedLayout);
  const [showPins, setShowPins] = useState(true);
  const slots = useRef(new Map<number, HTMLDivElement>());
  const [readerTarget, setReaderTarget] = useState<{ page: number } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<{ item: AnnotationItem } | null>(
    null,
  );
  const [surface, setSurface] = useState<HighlightSurface | null>(null);
  const [highlightTools, setHighlightTools] = useState<HTMLDivElement | null>(null);
  const [item, setItem] = useState<LibraryItem | null>(null),
    [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(''),
    [missing, setMissing] = useState(false),
    [attempt, setAttempt] = useState(0),
    [zoom, setZoom] = useState('fit'),
    [rotation, setRotation] = useState(0),
    [width, setWidth] = useState(0),
    [rendered, setRendered] = useState('');
  const progress = useReadingProgress(id, initialPage);
  const [ignoreLink, setIgnoreLink] = useState(false);
  const invalidLink =
    !ignoreLink &&
    (initialPage === null || (initialPage !== undefined && !!pdf && initialPage > pdf.numPages));
  const { page, setPage, reportRendered } = progress;
  const renderKey = `${page}:${zoom}:${rotation}:${width}`;
  const stage = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLDivElement>(null);
  const rendering = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const controller = new AbortController();
    void accountPreferences(user.id, controller.signal)
      .then(({ preferences }) => {
        if (controller.signal.aborted) return;
        setDefaultColor(preferences.highlightColor);
        initializePanel(preferences.annotationPanelOpen);
        if (!zoomTouched.current && !zoomInitialized.current) {
          zoomInitialized.current = true;
          setZoom(
            preferences.defaultZoom === 'fit-width'
              ? 'fit'
              : String(Number(preferences.defaultZoom) / 100),
          );
        }
        setPreferencesError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreferencesError(true);
      });
    return () => controller.abort();
  }, [id, user.id, initializePanel, preferencesAttempt]);
  useEffect(() => {
    if (!readerTarget || readerTarget.page !== page || rendered !== renderKey || error) return;
    const frame = requestAnimationFrame(() => {
      stage.current?.focus({ preventScroll: true });
      setReaderTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [readerTarget, page, rendered, renderKey, error]);
  useEffect(() => {
    const target = selectedAnnotation?.item;
    if (!target || target.pageNumber !== page || rendered !== renderKey || error || invalidLink)
      return;
    const frame = requestAnimationFrame(() => {
      const host = stage.current;
      const point =
        surface?.key !== renderKey
          ? null
          : target.kind === 'TEXT_HIGHLIGHT'
            ? quadBounds(target.anchor.quads[0], surface.viewport)
            : target.position && positionToViewport(target.position, surface.viewport);
      if (point && host) {
        // In continuous scroll the page sits somewhere down the column.
        const slot = layout === 'scroll' ? slots.current.get(page) : undefined;
        const box = slot?.getBoundingClientRect(),
          frame = host.getBoundingClientRect();
        const top = box ? box.top - frame.top + host.scrollTop : 0,
          left = box ? box.left - frame.left + host.scrollLeft : 0;
        host.scrollTop = Math.max(0, top + point.top - host.clientHeight / 3);
        host.scrollLeft = Math.max(0, left + point.left - host.clientWidth / 3);
      }
      const editor = document.getElementById(
        target.kind === 'PAGE_NOTE' ? 'page-note-content' : 'highlight-content',
      );
      editor?.scrollIntoView({ block: 'nearest' });
      editor?.focus({ preventScroll: true });
      setSelectedAnnotation(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedAnnotation, page, rendered, renderKey, surface, error, invalidLink, layout]);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(160, Math.floor(entries[0].contentRect.width - 32))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [item]);
  useEffect(() => {
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const metadata = await libraryVersion(id, controller.signal);
        if (controller.signal.aborted) return;
        setItem(metadata);
        const pdfjs = await import('pdfjs-dist');
        if (controller.signal.aborted) return;
        const assets = `/pdfjs/${pdfjs.version}/`;
        pdfjs.GlobalWorkerOptions.workerSrc = assets + 'pdf.worker.min.mjs';
        task = pdfjs.getDocument({
          url: `/api/v1/library/versions/${encodeURIComponent(id)}/pdf`,
          withCredentials: true,
          cMapUrl: assets + 'cmaps/',
          cMapPacked: true,
          standardFontDataUrl: assets + 'standard_fonts/',
          wasmUrl: assets + 'wasm/',
          disableAutoFetch: true,
          disableStream: true,
        });
        const document = await task.promise;
        if (!controller.signal.aborted) setPdf(document);
      } catch (e) {
        if (!controller.signal.aborted) {
          setMissing(pdfMissing(e));
          setError(libraryError(e));
        }
      }
    })();
    return () => {
      controller.abort();
      if (task) void task.destroy().catch(() => {});
    };
  }, [id, attempt]);
  useEffect(() => {
    const host = layout === 'scroll' ? slots.current.get(page) : paper.current;
    if (!pdf || !width || !host || !progress.ready || invalidLink) return;
    const controller = new AbortController();
    let render: RenderTask | undefined, text: TextLayer | undefined;
    // Each render owns its canvas, so cancellation and rapid zoom cannot reuse a busy canvas.
    const pageNode = document.createElement('div');
    pageNode.className = 'reader-page';
    // A continuous-scroll slot keeps its picture under the page until the page is drawn.
    if (layout === 'scroll') host.append(pageNode);
    else host.replaceChildren(pageNode);
    const previous = rendering.current;
    rendering.current = (async () => {
      let pdfPage: PDFPageProxy | undefined;
      try {
        await previous;
        if (controller.signal.aborted) return;
        await libraryVersion(id, controller.signal);
        pdfPage = await pdf.getPage(page);
        if (controller.signal.aborted) return;
        const { viewport, scale } = readerViewport(pdfPage, zoom, rotation, width);
        const ratio = canvasRatio(viewport);
        const canvas = document.createElement('canvas'),
          layer = document.createElement('div'),
          overlay = document.createElement('div'),
          pins = document.createElement('div');
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute('aria-label', `Trang PDF ${page}`);
        canvas.setAttribute('role', 'img');
        layer.className = 'textLayer';
        overlay.className = 'pdf-highlight-layer';
        pins.className = 'pdf-note-layer';
        pageNode.style.width = `${viewport.width}px`;
        pageNode.style.height = `${viewport.height}px`;
        pageNode.style.setProperty('--total-scale-factor', String(scale * pdfPage.userUnit));
        pageNode.append(canvas, overlay, layer, pins);
        render = pdfPage.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (controller.signal.aborted) return;
        const { TextLayer } = await import('pdfjs-dist');
        const textContent = await pdfPage.getTextContent();
        text = new TextLayer({
          container: layer,
          viewport,
          textContentSource: textContent,
        });
        await text.render();
        if (!controller.signal.aborted) {
          setSurface({
            key: `${page}:${zoom}:${rotation}:${width}`,
            page,
            element: pageNode,
            layer,
            overlay,
            pins,
            viewport,
            text: { parts: pdfTextParts(textContent.items), elements: text.textDivs },
          });
          setRendered(`${page}:${zoom}:${rotation}:${width}`);
          reportRendered(page);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          if (layout === 'scroll') pageNode.remove();
          else host.replaceChildren();
          setError(libraryError(e));
        }
      } finally {
        // Render/text promises have settled before releasing cached operators and images.
        // The next render waits for this cleanup, including when it reuses the same page.
        pdfPage?.cleanup();
      }
    })();
    return () => {
      controller.abort();
      render?.cancel();
      text?.cancel();
      pageNode.remove();
    };
  }, [pdf, id, page, zoom, rotation, width, progress.ready, reportRendered, invalidLink, layout]);
  function changePage(value: number) {
    if (value === page) return;
    setRendered('');
    setPage(value);
  }
  function changeLayout(value: Layout) {
    try {
      localStorage.setItem(LAYOUT_KEY, value);
    } catch {
      // Private windows may refuse storage; the choice still holds for this visit.
    }
    setRendered('');
    setLayout(value);
  }
  function retry() {
    setError('');
    setMissing(false);
    setPdf(null);
    setRendered('');
    setAttempt((n) => n + 1);
  }
  function navigateTool(value: number, focusStage = true) {
    if (!pdf || error || invalidLink || value < 1 || value > pdf.numPages) return false;
    return panel.begin(panel.active, () => {
      changePage(value);
      setReaderTarget(focusStage ? { page: value } : null);
    });
  }
  function closeTool() {
    const previous = tool;
    setTool(null);
    requestAnimationFrame(() => document.getElementById(`reader-${previous}-toggle`)?.focus());
  }
  return (
    <section
      onPointerDownCapture={() => {
        zoomTouched.current = true;
      }}
      onKeyDownCapture={() => {
        zoomTouched.current = true;
      }}
      className="content-section library-reader"
      data-focus-mode={focusMode}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (tool) {
          event.preventDefault();
          event.stopPropagation();
          closeTool();
        } else if (focusMode) {
          event.preventDefault();
          event.stopPropagation();
          setFocusMode(false);
          requestAnimationFrame(() => document.getElementById('reader-focus-toggle')?.focus());
        }
      }}
    >
      <Link href="/workspace/library">Về kho học liệu</Link>
      {invalidLink ? (
        <div role="alert" className="reader-link-notice">
          <p>
            Trang trong liên kết không hợp lệ{pdf ? ` (tài liệu có ${pdf.numPages} trang PDF)` : ''}
            . Chưa mở hoặc lưu tiến độ cho trang này.
          </p>
          <button
            className="secondary-button"
            disabled={!progress.ready}
            onClick={() =>
              panel.begin(panel.active, () => {
                setIgnoreLink(true);
                changePage(progress.previousPage || 1);
              })
            }
          >
            Đọc từ tiến độ đã lưu
          </button>
        </div>
      ) : (
        initialPage !== undefined &&
        !ignoreLink &&
        page === initialPage && (
          <div className="reader-link-notice">
            <p role="status">Đang mở trang được dẫn · Trang {initialPage}.</p>
            {progress.previousPage > 0 && progress.previousPage !== initialPage && (
              <button
                className="secondary-button"
                onClick={() =>
                  panel.begin(panel.active, () => {
                    setIgnoreLink(true);
                    changePage(progress.previousPage);
                  })
                }
              >
                Quay lại tiến độ trước · Trang {progress.previousPage}
              </button>
            )}
          </div>
        )
      )}
      <div className="reader-progress" aria-label="Tiến độ đọc riêng">
        <p
          role={
            ['save-error', 'conflict', 'load-error'].includes(progress.status) ? 'alert' : 'status'
          }
        >
          {progress.notice}
        </p>
        <div className="note-actions">
          {progress.status === 'load-error' && (
            <>
              <button className="secondary-button" onClick={progress.reload}>
                Thử tải tiến độ
              </button>
              <button className="secondary-button" onClick={progress.skip}>
                Đọc từ trang 1, chưa lưu tiến độ
              </button>
            </>
          )}
          {progress.status === 'save-error' && (
            <button className="secondary-button" onClick={progress.retrySave}>
              Thử lưu tiến độ
            </button>
          )}
          {['save-error', 'conflict', 'skipped'].includes(progress.status) && (
            <button className="secondary-button" onClick={progress.reload}>
              Tải lại tiến độ
            </button>
          )}
        </div>
      </div>
      {preferencesError && (
        <p className="field-hint" role="status">
          Chưa tải được cài đặt tài khoản. Lựa chọn đang dùng được giữ trong phiên này.{' '}
          <button
            className="quiet-button"
            onClick={() => setPreferencesAttempt((value) => value + 1)}
          >
            Thử tải cài đặt đọc
          </button>
        </p>
      )}
      <div className="reader-layout" data-panel-open={panel.open}>
        <div className="reader-document">
          {error ? (
            <>
              <div role="alert">
                <p>{error}</p>
                {!missing && (
                  <button className="primary-button" onClick={retry}>
                    Thử mở lại PDF
                  </button>
                )}
              </div>
              {missing && <ReaderReport key={`report-${id}`} versionId={id} />}
            </>
          ) : (
            <>
              {!item ? (
                <p role="status">Đang tải thông tin học liệu…</p>
              ) : (
                <>
                  <h2>{item.title}</h2>
                  <p>
                    {item.authors || 'Chưa ghi tác giả'} · Phiên bản {item.versionNo}
                    {!item.current ? ' · Bản công bố trước' : ''}
                  </p>
                  {item.currentVersion && (
                    <CurrentVersionNotice
                      versionNo={item.versionNo}
                      current={item.currentVersion}
                    />
                  )}
                  <SaveMaterial key={`save-${item.documentId}`} documentId={item.documentId} />
                  <ReaderReport key={`report-${item.versionId}`} versionId={item.versionId} />
                  <ScheduleReading
                    key={`schedule-${item.versionId}`}
                    versionId={item.versionId}
                    pageNumber={page}
                    title={item.title}
                    disabled={invalidLink}
                  />
                  <div className="reader-toolbar" aria-label="Điều khiển đọc PDF">
                    <button
                      className="secondary-button"
                      disabled={!pdf || invalidLink || page === 1}
                      onClick={() => changePage(page - 1)}
                    >
                      Trang trước
                    </button>
                    <label>
                      Trang{' '}
                      <input
                        aria-label="Số trang"
                        type="number"
                        min={1}
                        max={pdf?.numPages ?? item.pageCount}
                        value={page}
                        disabled={!pdf || invalidLink}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (
                            Number.isInteger(value) &&
                            value >= 1 &&
                            value <= (pdf?.numPages ?? 1)
                          )
                            changePage(value);
                        }}
                      />
                    </label>
                    <span>/ {pdf?.numPages ?? item.pageCount}</span>
                    <button
                      className="secondary-button"
                      disabled={!pdf || invalidLink || page === pdf.numPages}
                      onClick={() => changePage(page + 1)}
                    >
                      Trang sau
                    </button>
                    <SelectField
                      id="reader-zoom"
                      label="Mức phóng"
                      size="default"
                      value={zoom}
                      disabled={!pdf}
                      onChange={(value) => {
                        setRendered('');
                        setZoom(value);
                      }}
                      options={[
                        { value: 'fit', label: 'Vừa chiều rộng' },
                        ...[0.75, 1, 1.25, 1.5, 2].map((value) => ({
                          value: String(value),
                          label: `${value * 100}%`,
                        })),
                      ]}
                    />
                    <button
                      className="secondary-button"
                      disabled={!pdf}
                      onClick={() => {
                        setRendered('');
                        setRotation((r) => (r + 90) % 360);
                      }}
                    >
                      Xoay trang
                    </button>
                    <button
                      id="reader-focus-toggle"
                      className="secondary-button"
                      aria-pressed={focusMode}
                      onClick={() => setFocusMode((value) => !value)}
                    >
                      {focusMode ? 'Thoát đọc tập trung' : 'Đọc tập trung'}
                    </button>
                    <button
                      className="secondary-button"
                      aria-pressed={layout === 'scroll'}
                      disabled={!pdf}
                      onClick={() => changeLayout(layout === 'scroll' ? 'single' : 'scroll')}
                    >
                      Cuộn liền các trang
                    </button>
                    {item.downloadAllowed ? (
                      <>
                        <a
                          className="secondary-button"
                          href={`/api/v1/library/versions/${item.versionId}/download`}
                        >
                          {item.sourceFile ? 'Tải bản PDF' : 'Tải PDF gốc'}
                        </a>
                        {item.sourceFile && (
                          <a
                            className="secondary-button"
                            href={`/api/v1/library/versions/${item.versionId}/source-download`}
                          >
                            Tải Word gốc
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="field-hint">Chỉ đọc trong hệ thống</span>
                    )}
                  </div>
                  {pdf && (
                    <div className="reader-tools">
                      <button
                        id="reader-find-toggle"
                        className="secondary-button"
                        aria-expanded={tool === 'find'}
                        aria-controls="reader-find-panel"
                        disabled={invalidLink}
                        onClick={() => (tool === 'find' ? closeTool() : setTool('find'))}
                      >
                        Tìm trong PDF
                      </button>
                      <ReaderThumbnails
                        pdf={pdf}
                        page={page}
                        rotation={rotation}
                        open={tool === 'pages'}
                        onToggle={() => (tool === 'pages' ? closeTool() : setTool('pages'))}
                        onNavigate={navigateTool}
                      />
                      <ReaderOutline
                        pdf={pdf}
                        open={tool === 'outline'}
                        onToggle={() => (tool === 'outline' ? closeTool() : setTool('outline'))}
                        onNavigate={navigateTool}
                      />
                      {tool === 'find' && (
                        <div id="reader-find-panel" className="reader-tool-panel">
                          <ReaderFind
                            pdf={pdf}
                            versionId={id}
                            hasText={item.hasTextLayer}
                            surface={
                              !error && rendered === renderKey && surface?.key === renderKey
                                ? surface
                                : null
                            }
                            onNavigate={(value) => navigateTool(value, false)}
                            onClose={closeTool}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {item.sourceFile && (
                    <p className="field-hint">
                      Bản đọc được chuyển từ Word. Ghi chú và vùng tô sáng được lưu riêng trên phiên
                      bản PDF này.
                    </p>
                  )}
                  <p role="status">
                    {invalidLink
                      ? 'Hãy chọn đọc từ tiến độ đã lưu để tiếp tục.'
                      : rendered === renderKey
                        ? `Đã hiển thị trang ${page} / ${pdf?.numPages}`
                        : 'Đang mở trang PDF…'}
                  </p>
                  {!item.hasTextLayer && (
                    <p className="field-hint">
                      Tài liệu scan có thể không chọn được chữ. OCR chưa được hỗ trợ.
                    </p>
                  )}
                  <div className="reader-highlight-region">
                    <div ref={setHighlightTools} className="reader-highlight-tools" />
                    <div
                      className="reader-stage"
                      ref={stage}
                      tabIndex={0}
                      data-layout={layout}
                      aria-label={
                        layout === 'scroll'
                          ? 'Các trang tài liệu; cuộn để đọc tiếp'
                          : 'Trang tài liệu; cuộn ngang khi phóng lớn'
                      }
                    >
                      {layout === 'scroll' && pdf && !invalidLink ? (
                        <ContinuousPages
                          key="scroll"
                          pdf={pdf}
                          page={page}
                          zoom={zoom}
                          rotation={rotation}
                          width={width}
                          stageRef={stage}
                          slotsRef={slots}
                          onScrollPage={changePage}
                          versionId={id}
                          showPins={showPins}
                        />
                      ) : (
                        <div key="single" ref={paper} />
                      )}
                    </div>
                  </div>
                  <details className="reader-source">
                    <summary>
                      {item.publicationMethod === 'LECTURER_SELF'
                        ? 'Thông tin tài liệu'
                        : 'Nguồn và quyền sử dụng'}
                    </summary>
                    <dl className="scope-list">
                      <div>
                        <dt>Nguồn</dt>
                        <dd>{item.sourceReference || 'Giảng viên chưa ghi nguồn tham khảo.'}</dd>
                      </div>
                      {item.publicationMethod === 'LECTURER_SELF' ? (
                        <div>
                          <dt>Công bố</dt>
                          <dd>Giảng viên tự công bố.</dd>
                        </div>
                      ) : (
                        <div>
                          <dt>Căn cứ quyền</dt>
                          <dd>{item.rightsBasis || 'Không có thông tin khai báo.'}</dd>
                        </div>
                      )}
                      {(item.publicationMethod !== 'LECTURER_SELF' || item.rightsValidUntil) && (
                        <div>
                          <dt>Hạn quyền</dt>
                          <dd>
                            {item.rightsValidUntil
                              ? new Date(item.rightsValidUntil).toLocaleDateString('vi-VN')
                              : 'Chưa đặt thời hạn'}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Môn học</dt>
                        <dd>{item.courses.map((c) => `${c.code} · ${c.name}`).join('; ')}</dd>
                      </div>
                    </dl>
                    <p>{item.description}</p>
                  </details>
                  <p className="field-hint">
                    Vùng tô và ghi chú cần mạng để lưu. Chưa đọc offline hoặc xuất PDF kèm ghi chú.
                  </p>
                </>
              )}
            </>
          )}
        </div>
        {item && (
          <ReaderAnnotationPanel
            notebook={
              <ReaderNotebook
                versionId={id}
                title={item.title}
                active={panel.open && panel.scope === 'all'}
                available={!error && !invalidLink && !!pdf}
                onSelect={(annotation) => {
                  panel.select(annotation, () => {
                    changePage(annotation.pageNumber);
                    setSelectedAnnotation({ item: annotation });
                  });
                }}
              />
            }
            highlights={
              <ReaderHighlights
                defaultColor={defaultColor}
                onEdit={() => setFocusMode(false)}
                source={item}
                versionId={id}
                page={page}
                surface={
                  !error && rendered === renderKey && surface?.key === renderKey ? surface : null
                }
                tools={highlightTools}
                available={!error}
              />
            }
            notes={
              <ReaderNotes
                versionId={id}
                page={page}
                surface={
                  !error && rendered === renderKey && surface?.key === renderKey ? surface : null
                }
                tools={highlightTools}
                onEdit={() => setFocusMode(false)}
                showPins={showPins}
                onShowPins={setShowPins}
              />
            }
          />
        )}
      </div>
    </section>
  );
}
