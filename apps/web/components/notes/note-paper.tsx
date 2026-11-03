import type { ReactNode } from 'react';
import { PAPER_INK, type Paper, type PaperColor, type Rect } from '../../lib/note-model';

/**
 * Paper backgrounds drawn as SVG patterns in page coordinates, so lines stay sharp at any zoom,
 * in print and in PNG export. Spacing follows real paper: 5 mm grid, 8 mm Vietnamese "ô li" rows
 * with three thin lines, 7 mm / 9 mm ruling.
 */
const MM = 96 / 25.4;
const TOP = 96;
const MARGIN_X = 72;

function pattern(id: string, paper: Paper, color: PaperColor): ReactNode {
  const ink = PAPER_INK[color];
  switch (paper) {
    case 'RULED_NARROW':
    case 'RULED_WIDE':
    case 'CORNELL': {
      const step = paper === 'RULED_WIDE' ? 9 * MM : 7 * MM;
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" x="0" y={TOP} width="40" height={step}>
          <line x1="0" x2="40" y1={step - 0.5} y2={step - 0.5} stroke={ink.line} strokeWidth="1" />
        </pattern>
      );
    }
    case 'GRID': {
      const step = 5 * MM;
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={step} height={step}>
          <path
            d={`M ${step} 0 V ${step} M 0 ${step} H ${step}`}
            stroke={ink.line}
            strokeWidth="0.8"
            fill="none"
          />
        </pattern>
      );
    }
    case 'DOT': {
      const step = 5 * MM;
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" width={step} height={step}>
          <circle cx={step / 2} cy={step / 2} r="1.15" fill={ink.line} />
        </pattern>
      );
    }
    case 'O_LI': {
      // Vở 4 ô li: 8 mm squares; each row has a strong top line and three thin lines 2 mm apart.
      const step = 8 * MM;
      const dark = color === 'dark';
      const thin = dark ? '#4b4466' : '#cdbfe6',
        strong = dark ? '#6b5f93' : '#9c84cf';
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" x="0" y={TOP} width={step} height={step}>
          <line x1="0.5" x2="0.5" y1="0" y2={step} stroke={thin} strokeWidth="0.8" />
          {[1, 2, 3].map((k) => (
            <line
              key={k}
              x1="0"
              x2={step}
              y1={(k * step) / 4}
              y2={(k * step) / 4}
              stroke={thin}
              strokeWidth="0.6"
            />
          ))}
          <line x1="0" x2={step} y1="0.5" y2="0.5" stroke={strong} strokeWidth="1" />
        </pattern>
      );
    }
    case 'MUSIC': {
      const gap = 2 * MM,
        height = 4 * gap + 14 * MM;
      return (
        <pattern id={id} patternUnits="userSpaceOnUse" x="0" y={TOP} width="40" height={height}>
          {[0, 1, 2, 3, 4].map((k) => (
            <line
              key={k}
              x1="0"
              x2="40"
              y1={k * gap + 0.5}
              y2={k * gap + 0.5}
              stroke={ink.line}
              strokeWidth="0.9"
            />
          ))}
        </pattern>
      );
    }
    default:
      return null;
  }
}

/**
 * The paper of one page. `page` is the sheet (A4) or, for an infinite page, the visible area;
 * `bounded` adds the header space, margin line and Cornell sections a real sheet has.
 */
export function NotePaper({
  id,
  paper,
  color,
  page,
  bounded,
}: {
  id: string;
  paper: Paper;
  color: PaperColor;
  page: Rect;
  bounded: boolean;
}) {
  const ink = PAPER_INK[color];
  const lined = paper !== 'BLANK';
  const top = bounded && paper !== 'GRID' && paper !== 'DOT' ? TOP : page.y;
  const bottom = page.y + page.h - (bounded && paper !== 'GRID' && paper !== 'DOT' ? 48 : 0);
  const marginLine = paper === 'RULED_NARROW' || paper === 'RULED_WIDE' || paper === 'O_LI';
  return (
    <g aria-hidden="true">
      <defs>{pattern(id, paper, color)}</defs>
      <rect x={page.x} y={page.y} width={page.w} height={page.h} fill={ink.fill} />
      {lined && bottom > top && (
        <rect x={page.x} y={top} width={page.w} height={bottom - top} fill={`url(#${id})`} />
      )}
      {marginLine && (
        <line
          x1={MARGIN_X}
          x2={MARGIN_X}
          y1={bounded ? page.y : page.y}
          y2={page.y + page.h}
          stroke={ink.strong}
          strokeWidth="1.2"
        />
      )}
      {paper === 'CORNELL' && (
        <>
          <line
            x1={page.x + 58 * MM}
            x2={page.x + 58 * MM}
            y1={top}
            y2={bounded ? bottom - 50 * MM : page.y + page.h}
            stroke={ink.strong}
            strokeWidth="1.4"
          />
          {bounded && (
            <line
              x1={page.x}
              x2={page.x + page.w}
              y1={bottom - 50 * MM}
              y2={bottom - 50 * MM}
              stroke={ink.strong}
              strokeWidth="1.4"
            />
          )}
        </>
      )}
    </g>
  );
}
