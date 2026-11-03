'use client';

import { getStroke } from 'perfect-freehand';
import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  fontFamily,
  type Block,
  type ImageItem,
  type PageItem,
  type QuoteItem,
  type ShapeItem,
  type StickerItem,
  type StrokeItem,
  type TextItem,
} from '../../lib/note-model';
import { assetUrl, type AssetInfo, type QuoteView } from '../../lib/notes';
import { stickerById } from './note-stickers';

/** What a renderer needs besides the items: quote texts, image states and local previews. */
export type RenderContext = {
  quotes: Record<string, QuoteView>;
  assets: Record<string, AssetInfo>;
  /** Object URLs of images uploaded in this session, shown while the server still checks them. */
  localImages: ReadonlyMap<string, string>;
  /** Thumbnails use the small image variant. */
  thumb?: boolean;
  /** Quote cards link to the reader (editor select mode and print view). */
  links?: boolean;
  /** Reports measured text heights, for selection boxes and hit testing. */
  onMeasure?: (id: string, height: number) => void;
  /** Items not drawn (a text box being edited is shown by its editor instead). */
  hidden?: ReadonlySet<string>;
};

// ---- Strokes ----------------------------------------------------------------------------------

const strokeCache = new WeakMap<StrokeItem, string>();
function svgPath(outline: number[][]) {
  if (outline.length < 2) return '';
  const avg = (a: number, b: number) => ((a + b) / 2).toFixed(2);
  let d = `M${outline[0][0].toFixed(2)},${outline[0][1].toFixed(2)} Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += `${x0.toFixed(2)},${y0.toFixed(2)} ${avg(x0, x1)},${avg(y0, y1)} `;
  }
  return d + 'Z';
}
export function strokeOutline(item: Pick<StrokeItem, 'tool' | 'width' | 'points'>, last = true) {
  const input: number[][] = [];
  let pressured = false;
  for (let i = 0; i + 2 < item.points.length; i += 3) {
    input.push([item.points[i], item.points[i + 1], item.points[i + 2]]);
    if (Math.abs(item.points[i + 2] - 0.5) > 0.01) pressured = true;
  }
  const options =
    item.tool === 'fountain'
      ? {
          size: item.width * 1.7,
          thinning: 0.62,
          smoothing: 0.6,
          streamline: 0.5,
          simulatePressure: !pressured,
          start: { taper: item.width * 3 },
          end: { taper: item.width * 4 },
        }
      : item.tool === 'pencil'
        ? {
            size: item.width,
            thinning: 0.3,
            smoothing: 0.5,
            streamline: 0.4,
            simulatePressure: !pressured,
          }
        : item.tool === 'highlighter'
          ? {
              size: item.width,
              thinning: 0,
              smoothing: 0.6,
              streamline: 0.6,
              simulatePressure: false,
              start: { cap: false },
              end: { cap: false },
            }
          : {
              size: item.width,
              thinning: 0.12,
              smoothing: 0.6,
              streamline: 0.45,
              simulatePressure: false,
            };
  return svgPath(getStroke(input, { ...options, last }));
}
function cachedOutline(item: StrokeItem) {
  let d = strokeCache.get(item);
  if (d === undefined) {
    d = strokeOutline(item);
    strokeCache.set(item, d);
  }
  return d;
}
export function strokeStyle(tool: StrokeItem['tool']): CSSProperties | undefined {
  return tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined;
}
export function StrokeShape({ item, d }: { item: Pick<StrokeItem, 'tool' | 'color'>; d: string }) {
  return (
    <path
      d={d}
      fill={item.color}
      opacity={item.tool === 'highlighter' ? 0.42 : item.tool === 'pencil' ? 0.82 : 1}
      filter={item.tool === 'pencil' ? 'url(#note-pencil)' : undefined}
      style={strokeStyle(item.tool)}
    />
  );
}

/** Shared SVG definitions: pencil grain. */
export function NoteDefs() {
  return (
    <defs>
      <filter id="note-pencil" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="1.4"
          numOctaves="1"
          seed="3"
          result="grain"
        />
        <feColorMatrix
          in="grain"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25"
          result="mask"
        />
        <feComposite in="SourceGraphic" in2="mask" operator="in" />
      </filter>
    </defs>
  );
}

// ---- Shapes -----------------------------------------------------------------------------------

export function ShapeNode({ item }: { item: Omit<ShapeItem, 'id' | 'type'> }) {
  const x = Math.min(item.x1, item.x2),
    y = Math.min(item.y1, item.y2),
    w = Math.abs(item.x2 - item.x1),
    h = Math.abs(item.y2 - item.y1);
  const common = {
    stroke: item.color,
    strokeWidth: item.width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeDasharray: item.dash ? `${item.width * 3} ${item.width * 2.2}` : undefined,
    fill: item.fill ?? 'none',
  };
  switch (item.shape) {
    case 'line':
      return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} {...common} />;
    case 'arrow': {
      const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
      const head = Math.max(12, item.width * 4.5);
      const left = angle + Math.PI * 0.82,
        right = angle - Math.PI * 0.82;
      return (
        <g>
          <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} {...common} fill="none" />
          <path
            d={`M${item.x2 + Math.cos(left) * head},${item.y2 + Math.sin(left) * head} L${item.x2},${item.y2} L${item.x2 + Math.cos(right) * head},${item.y2 + Math.sin(right) * head}`}
            {...common}
            strokeDasharray={undefined}
            fill="none"
          />
        </g>
      );
    }
    case 'rect':
      return <rect x={x} y={y} width={w} height={h} rx={Math.min(6, w / 4, h / 4)} {...common} />;
    case 'ellipse':
      return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
    case 'triangle':
      return <path d={`M${x + w / 2},${y} L${x + w},${y + h} L${x},${y + h} Z`} {...common} />;
  }
}

// ---- Text -------------------------------------------------------------------------------------

export function textBoxStyle(item: TextItem): CSSProperties {
  return {
    fontFamily: fontFamily(item.font),
    fontSize: `${item.size}px`,
    lineHeight: 1.45,
    color: item.color,
    textAlign: item.align,
    background: item.bg ?? 'transparent',
    padding: '4px 6px',
    borderRadius: item.bg ? '6px' : undefined,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    width: `${item.w}px`,
    boxSizing: 'border-box',
    margin: 0,
  };
}
function runStyle(run: Block['runs'][number]): CSSProperties {
  const lines = [run.u && 'underline', run.s && 'line-through'].filter(Boolean).join(' ');
  return {
    fontWeight: run.b ? 700 : undefined,
    fontStyle: run.i ? 'italic' : undefined,
    textDecoration: lines || undefined,
    color: run.c,
  };
}
const listStyle: CSSProperties = { margin: 0, paddingLeft: '1.4em' };
/** Text blocks as HTML: paragraphs, and consecutive list blocks grouped into one list. */
export function TextBlocks({ blocks }: { blocks: Block[] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];
    const runs = (b: Block) =>
      b.runs.length ? (
        b.runs.map((run, k) => (
          <span key={k} style={runStyle(run)}>
            {run.t}
          </span>
        ))
      ) : (
        <br />
      );
    if (block.list) {
      const kind = block.list;
      const items: ReactNode[] = [];
      let j = i;
      for (; j < blocks.length && blocks[j].list === kind; j++)
        items.push(<li key={j}>{runs(blocks[j])}</li>);
      out.push(
        kind === 'ol' ? (
          <ol key={i} style={listStyle}>
            {items}
          </ol>
        ) : (
          <ul key={i} style={listStyle}>
            {items}
          </ul>
        ),
      );
      i = j;
    } else {
      out.push(<div key={i}>{runs(block)}</div>);
      i++;
    }
  }
  return <>{out}</>;
}
function TextNode({ item, onMeasure }: { item: TextItem; onMeasure?: RenderContext['onMeasure'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !onMeasure) return;
    onMeasure(item.id, node.offsetHeight);
    const observer = new ResizeObserver(() => onMeasure(item.id, node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id, onMeasure]);
  return (
    <foreignObject
      x={item.x}
      y={item.y}
      width={item.w}
      height={4000}
      style={{ overflow: 'visible', pointerEvents: 'none' }}
    >
      <div ref={ref} data-note-text={item.id} style={textBoxStyle(item)}>
        <TextBlocks blocks={item.blocks} />
      </div>
    </foreignObject>
  );
}

// ---- Images, stickers, quotes -----------------------------------------------------------------

function Placeholder({
  item,
  text,
  tone,
}: {
  item: { x: number; y: number; w: number; h: number };
  text: string;
  tone: 'wait' | 'bad';
}) {
  return (
    <g>
      <rect
        x={item.x}
        y={item.y}
        width={item.w}
        height={item.h}
        rx="6"
        fill={tone === 'bad' ? '#fbefed' : '#eef3f9'}
        stroke={tone === 'bad' ? '#943a32' : '#9fb3ca'}
        strokeDasharray="6 4"
      />
      <text
        x={item.x + item.w / 2}
        y={item.y + item.h / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Notes Be Vietnam Pro', sans-serif"
        fontSize={Math.max(10, Math.min(16, item.w / 14))}
        fill={tone === 'bad' ? '#943a32' : '#52647a'}
      >
        {text}
      </text>
    </g>
  );
}
function ImageNode({ item, ctx }: { item: ImageItem; ctx: RenderContext }) {
  const info = ctx.assets[item.assetId];
  const local = ctx.localImages.get(item.assetId);
  const href = local ?? (info?.status === 'SAFE' ? assetUrl(item.assetId, ctx.thumb) : null);
  const cx = item.x + item.w / 2,
    cy = item.y + item.h / 2;
  if (!href)
    return (
      <g transform={item.rot ? `rotate(${item.rot} ${cx} ${cy})` : undefined}>
        <Placeholder
          item={item}
          text={info?.status === 'FAILED' ? 'Ảnh không qua kiểm tra' : 'Đang kiểm tra ảnh…'}
          tone={info?.status === 'FAILED' ? 'bad' : 'wait'}
        />
      </g>
    );
  const natural = { w: info?.width ?? item.w, h: info?.height ?? item.h };
  const crop = item.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return (
    <g transform={item.rot ? `rotate(${item.rot} ${cx} ${cy})` : undefined}>
      <svg
        x={item.x}
        y={item.y}
        width={item.w}
        height={item.h}
        viewBox={`${crop.x * natural.w} ${crop.y * natural.h} ${crop.w * natural.w} ${crop.h * natural.h}`}
        preserveAspectRatio="none"
      >
        <image
          href={href}
          x="0"
          y="0"
          width={natural.w}
          height={natural.h}
          preserveAspectRatio="none"
        />
      </svg>
    </g>
  );
}
function StickerNode({ item }: { item: StickerItem }) {
  const sticker = stickerById.get(item.sticker);
  const cx = item.x + item.w / 2,
    cy = item.y + item.h / 2;
  return (
    <g transform={item.rot ? `rotate(${item.rot} ${cx} ${cy})` : undefined}>
      {sticker ? (
        <svg
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          viewBox={sticker.viewBox}
          preserveAspectRatio="none"
        >
          {sticker.art}
        </svg>
      ) : (
        <Placeholder item={item} text="Sticker" tone="wait" />
      )}
    </g>
  );
}
export const readerHref = (versionId: string, pageNumber: number) =>
  `/workspace/library/versions/${encodeURIComponent(versionId)}?page=${pageNumber}`;
function QuoteNode({ item, ctx }: { item: QuoteItem; ctx: RenderContext }) {
  const view = ctx.quotes[item.annotationId];
  const card: CSSProperties = {
    boxSizing: 'border-box',
    width: `${item.w}px`,
    height: `${item.h}px`,
    overflow: 'hidden',
    borderRadius: '10px',
    border: '1px solid #dce4ef',
    borderLeft: `6px solid ${view?.available ? view.color : '#9fb3ca'}`,
    background: '#ffffff',
    padding: '12px 16px',
    fontFamily: "'Notes Be Vietnam Pro', sans-serif",
    color: '#172b45',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  };
  return (
    <foreignObject
      x={item.x}
      y={item.y}
      width={item.w}
      height={item.h}
      style={{ overflow: 'visible' }}
    >
      <div style={card} data-note-quote={item.annotationId}>
        {!view ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#52647a' }}>Đang tải trích dẫn…</p>
        ) : !view.available ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#52647a' }}>
            Tài liệu không còn khả dụng.
          </p>
        ) : (
          <>
            {view.quote && (
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  lineHeight: '22px',
                  fontStyle: 'italic',
                  overflow: 'hidden',
                  flex: '0 1 auto',
                }}
              >
                “{view.quote}”
              </p>
            )}
            {view.note && (
              <p
                style={{
                  margin: 0,
                  fontSize: '15px',
                  lineHeight: '22px',
                  overflow: 'hidden',
                  flex: '0 1 auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {view.note}
              </p>
            )}
            <p
              style={{
                margin: 'auto 0 0',
                fontSize: '13px',
                color: '#52647a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {ctx.links ? (
                <a
                  href={readerHref(view.versionId, view.pageNumber)}
                  style={{ color: '#0056a6', pointerEvents: 'auto' }}
                  data-note-link
                >
                  {view.title} · tr. {view.pageNumber}
                </a>
              ) : (
                <>
                  {view.title} · tr. {view.pageNumber}
                </>
              )}
            </p>
          </>
        )}
      </div>
    </foreignObject>
  );
}

function ItemNode({ item, ctx }: { item: PageItem; ctx: RenderContext }) {
  switch (item.type) {
    case 'stroke':
      return <StrokeShape item={item} d={cachedOutline(item)} />;
    case 'shape':
      return <ShapeNode item={item} />;
    case 'text':
      return <TextNode item={item} onMeasure={ctx.onMeasure} />;
    case 'image':
      return <ImageNode item={item} ctx={ctx} />;
    case 'sticker':
      return <StickerNode item={item} />;
    case 'quote':
      return <QuoteNode item={item} ctx={ctx} />;
  }
}

/** Paints the items in order; memoized on the (immutable) items array and context. */
export const NoteItems = memo(function NoteItems({
  items,
  ctx,
}: {
  items: PageItem[];
  ctx: RenderContext;
}) {
  return (
    <g>
      {items.map((item) =>
        ctx.hidden?.has(item.id) ? null : (
          <g key={item.id} data-note-item={item.id} data-note-type={item.type}>
            <ItemNode item={item} ctx={ctx} />
          </g>
        ),
      )}
    </g>
  );
});
