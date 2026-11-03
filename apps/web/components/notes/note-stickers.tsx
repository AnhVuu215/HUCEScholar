import type { ReactNode } from 'react';

/**
 * CANVAS-01 decorations, drawn for this project as SVG (no third-party artwork). Each sticker
 * draws into its own `viewBox` and is stretched to the item's box; `w`/`h` are the default size.
 */
export type Sticker = {
  id: string;
  label: string;
  group: 'icon' | 'washi' | 'label' | 'frame';
  viewBox: string;
  w: number;
  h: number;
  art: ReactNode;
};
export const STICKER_GROUPS: Record<Sticker['group'], string> = {
  icon: 'Biểu tượng',
  washi: 'Băng dính washi',
  label: 'Nhãn',
  frame: 'Khung',
};

const icon = (id: string, label: string, art: ReactNode): Sticker => ({
  id,
  label,
  group: 'icon',
  viewBox: '0 0 100 100',
  w: 64,
  h: 64,
  art,
});
function washi(id: string, label: string, fill: string, pattern: ReactNode): Sticker {
  return {
    id,
    label,
    group: 'washi',
    viewBox: '0 0 240 48',
    w: 220,
    h: 44,
    art: (
      <>
        <path
          d="M4 6 L10 2 L16 6 L22 2 L28 6 L34 2 L40 6 L230 4 L236 8 L232 14 L238 20 L232 26 L238 32 L232 38 L236 44 L10 46 L4 40 L8 34 L2 28 L8 22 L2 16 L8 10 Z"
          fill={fill}
          opacity="0.82"
        />
        <g opacity="0.55">{pattern}</g>
      </>
    ),
  };
}
function label(id: string, text: string, fill: string, ink: string): Sticker {
  return {
    id,
    label: `Nhãn “${text}”`,
    group: 'label',
    viewBox: '0 0 200 56',
    w: 180,
    h: 50,
    art: (
      <>
        <path d="M6 6 H170 L194 28 L170 50 H6 Z" fill={fill} />
        <circle cx="168" cy="28" r="5" fill="#ffffff" opacity="0.85" />
        <text
          x="86"
          y="36"
          textAnchor="middle"
          fontFamily="'Notes Be Vietnam Pro', sans-serif"
          fontWeight="700"
          fontSize="22"
          fill={ink}
        >
          {text}
        </text>
      </>
    ),
  };
}

export const STICKERS: Sticker[] = [
  icon(
    'check',
    'Dấu tích',
    <>
      <circle cx="50" cy="50" r="44" fill="#2e7d32" />
      <path
        d="M28 52 L44 68 L74 34"
        fill="none"
        stroke="#fff"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
  ),
  icon(
    'cross',
    'Dấu sai',
    <>
      <circle cx="50" cy="50" r="44" fill="#c62828" />
      <path d="M34 34 L66 66 M66 34 L34 66" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
    </>,
  ),
  icon(
    'star',
    'Ngôi sao',
    <path
      d="M50 6 L62 37 L95 38 L69 58 L78 91 L50 72 L22 91 L31 58 L5 38 L38 37 Z"
      fill="#fbc02d"
      stroke="#e0a100"
      strokeWidth="3"
      strokeLinejoin="round"
    />,
  ),
  icon(
    'heart',
    'Trái tim',
    <path
      d="M50 88 C20 66 6 50 6 32 C6 18 17 8 30 8 C40 8 46 14 50 22 C54 14 60 8 70 8 C83 8 94 18 94 32 C94 50 80 66 50 88 Z"
      fill="#e57373"
    />,
  ),
  icon(
    'warning',
    'Cảnh báo',
    <>
      <path
        d="M50 8 L95 88 H5 Z"
        fill="#ffb300"
        stroke="#e08e00"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <rect x="45" y="34" width="10" height="30" rx="4" fill="#3b2a00" />
      <circle cx="50" cy="74" r="6" fill="#3b2a00" />
    </>,
  ),
  icon(
    'idea',
    'Bóng đèn ý tưởng',
    <>
      <path
        d="M50 8 C30 8 18 23 18 40 C18 53 26 60 32 68 V76 H68 V68 C74 60 82 53 82 40 C82 23 70 8 50 8 Z"
        fill="#fff176"
        stroke="#f9a825"
        strokeWidth="4"
      />
      <rect x="34" y="78" width="32" height="8" rx="3" fill="#90a4ae" />
      <rect x="38" y="88" width="24" height="6" rx="3" fill="#78909c" />
      <path
        d="M42 44 L50 56 L58 44"
        fill="none"
        stroke="#f9a825"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>,
  ),
  icon(
    'question',
    'Dấu hỏi',
    <>
      <circle cx="50" cy="50" r="44" fill="#1d4ed8" />
      <path
        d="M36 38 C36 28 43 22 51 22 C60 22 66 28 66 36 C66 46 52 48 52 60"
        fill="none"
        stroke="#fff"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="52" cy="76" r="6" fill="#fff" />
    </>,
  ),
  icon(
    'pin',
    'Ghim',
    <>
      <circle cx="50" cy="34" r="24" fill="#d32f2f" />
      <circle cx="42" cy="26" r="7" fill="#ffffff" opacity="0.55" />
      <path d="M50 58 L50 94" stroke="#607d8b" strokeWidth="5" strokeLinecap="round" />
    </>,
  ),
  icon(
    'flag',
    'Lá cờ',
    <>
      <path d="M20 8 V94" stroke="#455a64" strokeWidth="6" strokeLinecap="round" />
      <path d="M23 12 C40 4 56 20 82 12 V52 C56 60 40 44 23 52 Z" fill="#ef6c00" />
    </>,
  ),
  icon(
    'book',
    'Sách',
    <>
      <path
        d="M10 22 C26 14 40 16 50 24 C60 16 74 14 90 22 V84 C74 76 60 78 50 86 C40 78 26 76 10 84 Z"
        fill="#90caf9"
        stroke="#1565c0"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M50 24 V86" stroke="#1565c0" strokeWidth="4" />
    </>,
  ),
  icon(
    'pencil',
    'Bút chì',
    <>
      <path
        d="M18 82 L24 62 L70 16 L84 30 L38 76 Z"
        fill="#ffca28"
        stroke="#8d6e63"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M18 82 L24 62 L38 76 Z" fill="#ffe0b2" />
      <path d="M18 82 L21 72 L28 79 Z" fill="#37474f" />
      <path d="M70 16 L84 30 L90 24 C92 22 92 18 90 16 L84 10 C82 8 78 8 76 10 Z" fill="#ef9a9a" />
    </>,
  ),
  icon(
    'clock',
    'Đồng hồ',
    <>
      <circle cx="50" cy="50" r="42" fill="#ffffff" stroke="#37474f" strokeWidth="7" />
      <path
        d="M50 26 V52 L66 62"
        fill="none"
        stroke="#37474f"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </>,
  ),
  icon(
    'target',
    'Mục tiêu',
    <>
      <circle cx="50" cy="50" r="44" fill="#ef5350" />
      <circle cx="50" cy="50" r="30" fill="#ffffff" />
      <circle cx="50" cy="50" r="16" fill="#ef5350" />
    </>,
  ),
  icon(
    'sparkle',
    'Lấp lánh',
    <>
      <path
        d="M50 6 C54 34 66 46 94 50 C66 54 54 66 50 94 C46 66 34 54 6 50 C34 46 46 34 50 6 Z"
        fill="#ba68c8"
      />
      <path
        d="M82 10 C83 18 86 21 94 22 C86 23 83 26 82 34 C81 26 78 23 70 22 C78 21 81 18 82 10 Z"
        fill="#f48fb1"
      />
    </>,
  ),
  icon(
    'trophy',
    'Cúp',
    <>
      <path d="M28 10 H72 V36 C72 52 62 62 50 62 C38 62 28 52 28 36 Z" fill="#ffc107" />
      <path
        d="M28 18 H12 C12 34 20 42 30 42 M72 18 H88 C88 34 80 42 70 42"
        fill="none"
        stroke="#ffc107"
        strokeWidth="6"
      />
      <rect x="44" y="62" width="12" height="16" fill="#ffb300" />
      <rect x="30" y="78" width="40" height="12" rx="3" fill="#8d6e63" />
    </>,
  ),
  icon(
    'coffee',
    'Tách cà phê',
    <>
      <path d="M16 36 H72 V64 C72 78 62 88 48 88 H40 C26 88 16 78 16 64 Z" fill="#8d6e63" />
      <path d="M72 44 C86 44 86 66 72 66" fill="none" stroke="#8d6e63" strokeWidth="7" />
      <path
        d="M32 12 C28 20 38 22 34 30 M48 10 C44 18 54 20 50 28"
        fill="none"
        stroke="#bcaaa4"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>,
  ),
  icon(
    'smile',
    'Mặt cười',
    <>
      <circle cx="50" cy="50" r="44" fill="#ffd54f" />
      <circle cx="35" cy="40" r="6" fill="#4e342e" />
      <circle cx="65" cy="40" r="6" fill="#4e342e" />
      <path
        d="M30 60 C38 74 62 74 70 60"
        fill="none"
        stroke="#4e342e"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </>,
  ),
  icon(
    'arrow-right',
    'Mũi tên chỉ',
    <path
      d="M8 40 H58 V20 L94 50 L58 80 V60 H8 Z"
      fill="#00838f"
      stroke="#005f66"
      strokeWidth="3"
      strokeLinejoin="round"
    />,
  ),
  washi(
    'washi-blue',
    'Băng dính xanh kẻ sọc',
    '#90caf9',
    Array.from({ length: 12 }, (_, i) => (
      <rect key={i} x={10 + i * 19} y="2" width="8" height="44" fill="#1565c0" opacity="0.35" />
    )),
  ),
  washi(
    'washi-pink',
    'Băng dính hồng chấm bi',
    '#f8bbd0',
    Array.from({ length: 22 }, (_, i) => (
      <circle
        key={i}
        cx={14 + (i % 11) * 21}
        cy={i < 11 ? 16 : 34}
        r="4"
        fill="#ad1457"
        opacity="0.5"
      />
    )),
  ),
  washi(
    'washi-green',
    'Băng dính xanh lá ô caro',
    '#c5e1a5',
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={`v${i}`}
          x={8 + i * 19}
          y="2"
          width="6"
          height="44"
          fill="#558b2f"
          opacity="0.35"
        />
      ))}
      <rect x="2" y="14" width="236" height="6" fill="#558b2f" opacity="0.35" />
      <rect x="2" y="30" width="236" height="6" fill="#558b2f" opacity="0.35" />
    </>,
  ),
  washi(
    'washi-yellow',
    'Băng dính vàng ngôi sao',
    '#fff59d',
    Array.from({ length: 9 }, (_, i) => (
      <path
        key={i}
        transform={`translate(${16 + i * 25} 24) scale(0.12)`}
        d="M0 -80 L19 -26 L76 -25 L31 9 L47 64 L0 32 L-47 64 L-31 9 L-76 -25 L-19 -26 Z"
        fill="#f9a825"
      />
    )),
  ),
  label('label-important', 'Quan trọng', '#c62828', '#ffffff'),
  label('label-review', 'Cần xem lại', '#ef6c00', '#ffffff'),
  label('label-exam', 'Thi', '#6a1b9a', '#ffffff'),
  label('label-homework', 'Bài tập', '#1d4ed8', '#ffffff'),
  label('label-done', 'Đã xong', '#2e7d32', '#ffffff'),
  {
    id: 'frame-rounded',
    label: 'Khung bo góc',
    group: 'frame',
    viewBox: '0 0 300 200',
    w: 300,
    h: 200,
    art: (
      <rect
        x="6"
        y="6"
        width="288"
        height="188"
        rx="22"
        fill="none"
        stroke="#1d4ed8"
        strokeWidth="5"
        strokeDasharray="14 9"
      />
    ),
  },
  {
    id: 'frame-note',
    label: 'Khung ghi nhớ',
    group: 'frame',
    viewBox: '0 0 300 200',
    w: 300,
    h: 200,
    art: (
      <>
        <rect
          x="4"
          y="4"
          width="292"
          height="192"
          rx="10"
          fill="#fff8e1"
          stroke="#f9a825"
          strokeWidth="4"
        />
        <rect x="4" y="4" width="292" height="34" rx="10" fill="#ffe082" />
        <text
          x="18"
          y="28"
          fontFamily="'Notes Be Vietnam Pro', sans-serif"
          fontWeight="700"
          fontSize="18"
          fill="#6d4c00"
        >
          Ghi nhớ
        </text>
      </>
    ),
  },
  {
    id: 'frame-cloud',
    label: 'Khung đám mây',
    group: 'frame',
    viewBox: '0 0 300 200',
    w: 300,
    h: 200,
    art: (
      <path
        d="M60 170 C24 170 8 140 26 118 C6 98 22 64 52 68 C56 34 96 22 120 42 C138 14 186 16 196 48 C226 30 266 50 260 84 C292 94 296 140 266 154 C262 176 232 184 212 170 C196 190 160 192 146 172 C126 190 84 190 60 170 Z"
        fill="#e3f2fd"
        stroke="#64b5f6"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    ),
  },
];
export const stickerById = new Map(STICKERS.map((s) => [s.id, s]));
