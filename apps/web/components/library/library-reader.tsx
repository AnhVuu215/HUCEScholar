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
import { libraryVersion, libraryError, type LibraryItem } from '../../lib/library';
import { ReaderNotes } from './reader-notes';

export function LibraryReader({ id }: { id: string }) {
  const [item, setItem] = useState<LibraryItem | null>(null),
    [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState('fit'),
    [rotation, setRotation] = useState(0),
    [width, setWidth] = useState(0),
    [rendered, setRendered] = useState('');
  const renderKey = `${page}:${zoom}:${rotation}:${width}`;
  const stage = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLDivElement>(null);
  const rendering = useRef<Promise<void>>(Promise.resolve());
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
        if (!controller.signal.aborted) setError(libraryError(e));
      }
    })();
    return () => {
      controller.abort();
      if (task) void task.destroy().catch(() => {});
    };
  }, [id, attempt]);
  useEffect(() => {
    if (!pdf || !width || !paper.current) return;
    const controller = new AbortController(),
      host = paper.current;
    let render: RenderTask | undefined, text: TextLayer | undefined;
    // Each render owns its canvas, so cancellation and rapid zoom cannot reuse a busy canvas.
    const pageNode = document.createElement('div');
    pageNode.className = 'reader-page';
    host.replaceChildren(pageNode);
    const previous = rendering.current;
    rendering.current = (async () => {
      let pdfPage: PDFPageProxy | undefined;
      try {
        await previous;
        if (controller.signal.aborted) return;
        await libraryVersion(id, controller.signal);
        pdfPage = await pdf.getPage(page);
        if (controller.signal.aborted) return;
        const natural = pdfPage.getViewport({ scale: 1, rotation });
        const scale = zoom === 'fit' ? width / natural.width : Number(zoom);
        const viewport = pdfPage.getViewport({ scale, rotation });
        // Bound canvas memory, including unusual page dimensions and high-DPI mobile screens.
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          4096 / Math.max(viewport.width, viewport.height),
          Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
        );
        const canvas = document.createElement('canvas'),
          layer = document.createElement('div');
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute('aria-label', `Trang PDF ${page}`);
        canvas.setAttribute('role', 'img');
        layer.className = 'textLayer';
        pageNode.style.width = `${viewport.width}px`;
        pageNode.style.height = `${viewport.height}px`;
        pageNode.style.setProperty('--total-scale-factor', String(scale));
        pageNode.append(canvas, layer);
        render = pdfPage.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (controller.signal.aborted) return;
        const { TextLayer } = await import('pdfjs-dist');
        text = new TextLayer({
          container: layer,
          viewport,
          textContentSource: await pdfPage.getTextContent(),
        });
        await text.render();
        if (!controller.signal.aborted) setRendered(`${page}:${zoom}:${rotation}:${width}`);
      } catch (e) {
        if (!controller.signal.aborted) {
          host.replaceChildren();
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
  }, [pdf, id, page, zoom, rotation, width]);
  function changePage(value: number) {
    if (value === page) return;
    setRendered('');
    setPage(value);
  }
  function retry() {
    setError('');
    setPdf(null);
    setRendered('');
    setPage(1);
    setAttempt((n) => n + 1);
  }
  return (
    <section className="content-section library-reader">
      <Link href="/workspace/library">Về kho học liệu</Link>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="primary-button" onClick={retry}>
            Thử mở lại PDF
          </button>
        </div>
      ) : (
        <>
          {!item ? (
            <p role="status">Đang tải thông tin học liệu…</p>
          ) : (
            <>
              <h2>{item.title}</h2>
              <p>
                {item.authors || 'Chưa ghi tác giả'} · Phiên bản {item.versionNo}
                {!item.current ? ' · Bản cũ đã duyệt' : ''}
              </p>
              <div className="reader-toolbar" aria-label="Điều khiển đọc PDF">
                <button
                  className="secondary-button"
                  disabled={!pdf || page === 1}
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
                    disabled={!pdf}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isInteger(value) && value >= 1 && value <= (pdf?.numPages ?? 1))
                        changePage(value);
                    }}
                  />
                </label>
                <span>/ {pdf?.numPages ?? item.pageCount}</span>
                <button
                  className="secondary-button"
                  disabled={!pdf || page === pdf.numPages}
                  onClick={() => changePage(page + 1)}
                >
                  Trang sau
                </button>
                <label>
                  Mức phóng{' '}
                  <select
                    aria-label="Mức phóng"
                    value={zoom}
                    disabled={!pdf}
                    onChange={(e) => {
                      setRendered('');
                      setZoom(e.target.value);
                    }}
                  >
                    <option value="fit">Vừa chiều rộng</option>
                    {[0.75, 1, 1.25, 1.5, 2].map((v) => (
                      <option key={v} value={v}>
                        {v * 100}%
                      </option>
                    ))}
                  </select>
                </label>
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
                {item.downloadAllowed ? (
                  <a
                    className="secondary-button"
                    href={`/api/v1/library/versions/${item.versionId}/download`}
                  >
                    Tải PDF gốc
                  </a>
                ) : (
                  <span className="field-hint">Chỉ đọc trong hệ thống</span>
                )}
              </div>
              <p role="status">
                {rendered === renderKey
                  ? `Đã hiển thị trang ${page} / ${pdf?.numPages}`
                  : 'Đang mở trang PDF…'}
              </p>
              {!item.hasTextLayer && (
                <p className="field-hint">
                  Tài liệu scan có thể không chọn được chữ. OCR chưa được hỗ trợ.
                </p>
              )}
              <div
                className="reader-stage"
                ref={stage}
                tabIndex={0}
                aria-label="Trang tài liệu; cuộn ngang khi phóng lớn"
              >
                <div ref={paper} />
              </div>
              <details className="reader-source">
                <summary>Nguồn và quyền sử dụng</summary>
                <dl className="scope-list">
                  <div>
                    <dt>Nguồn</dt>
                    <dd>{item.sourceReference}</dd>
                  </div>
                  <div>
                    <dt>Căn cứ quyền</dt>
                    <dd>{item.rightsBasis}</dd>
                  </div>
                  <div>
                    <dt>Hạn quyền</dt>
                    <dd>
                      {item.rightsValidUntil
                        ? new Date(item.rightsValidUntil).toLocaleDateString('vi-VN')
                        : 'Chưa đặt thời hạn'}
                    </dd>
                  </div>
                  <div>
                    <dt>Môn học</dt>
                    <dd>{item.courses.map((c) => `${c.code} · ${c.name}`).join('; ')}</dd>
                  </div>
                </dl>
                <p>{item.description}</p>
              </details>
              <p className="field-hint">
                Chưa hỗ trợ highlight, lưu tiến độ hoặc đọc offline. Chỉ đọc không phải cơ chế chống
                sao chép.
              </p>
            </>
          )}
        </>
      )}
      {item && <ReaderNotes versionId={id} page={page} />}
    </section>
  );
}
