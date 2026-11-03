'use client';

import type { Point } from '../../lib/note-model';

/**
 * CANVAS-03: a straightedge laid over the page. It is a tool, not page content: it is never
 * saved. Ink started along one of its long edges is projected onto that edge, as with a real
 * ruler in GoodNotes or Notability.
 */
export type Ruler = { x: number; y: number; angle: number };

/** 1 mm in page units (the page is 96 px per inch, A4 is 794 units wide). */
export const MM = 96 / 25.4;
export const RULER_LENGTH = 160 * MM;
export const RULER_HEIGHT = 64;
/** How close to an edge a stroke may start and still follow it. */
const SNAP = 16;
const KNOB = 14;

const rad = (deg: number) => (deg * Math.PI) / 180;
/** A page point in the ruler's frame: x along it from its centre, y across it. */
export function toRuler(r: Ruler, p: Point): Point {
  const c = Math.cos(rad(r.angle)),
    s = Math.sin(rad(r.angle));
  const dx = p.x - r.x,
    dy = p.y - r.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}
function fromRuler(r: Ruler, p: Point): Point {
  const c = Math.cos(rad(r.angle)),
    s = Math.sin(rad(r.angle));
  return { x: r.x + p.x * c - p.y * s, y: r.y + p.x * s + p.y * c };
}

export type RulerHit = 'knob' | 'body' | { edge: -1 | 1 } | null;
/** What a press at `p` means: turn the knob, move the ruler, draw along an edge, or nothing. */
export function hitRuler(r: Ruler, p: Point, zoom: number): RulerHit {
  const q = toRuler(r, p);
  const half = RULER_LENGTH / 2;
  if (Math.hypot(q.x - (half - 30), q.y) <= (KNOB + 4) / Math.min(1, zoom)) return 'knob';
  if (Math.abs(q.x) > half + SNAP) return null;
  const top = -RULER_HEIGHT / 2,
    bottom = RULER_HEIGHT / 2;
  const snap = SNAP / Math.min(1, zoom);
  if (Math.abs(q.y - top) <= snap && Math.abs(q.x) <= half) return { edge: -1 };
  if (Math.abs(q.y - bottom) <= snap && Math.abs(q.x) <= half) return { edge: 1 };
  if (q.y > top && q.y < bottom && Math.abs(q.x) <= half) return 'body';
  return null;
}

/** A line along one edge, shifted outwards by half the ink width so the ink sits on the edge. */
export function edgeRail(r: Ruler, edge: -1 | 1, inkWidth: number) {
  const a = fromRuler(r, { x: 0, y: edge * (RULER_HEIGHT / 2 + inkWidth / 2 + 0.5) });
  return { a, u: { x: Math.cos(rad(r.angle)), y: Math.sin(rad(r.angle)) } };
}
export function onRail(rail: { a: Point; u: Point }, p: Point): Point {
  const t = (p.x - rail.a.x) * rail.u.x + (p.y - rail.a.y) * rail.u.y;
  return { x: rail.a.x + rail.u.x * t, y: rail.a.y + rail.u.y * t };
}

/** The angle the knob points to, snapped near round angles, or to 15° steps with Shift. */
export function knobAngle(r: Ruler, p: Point, steps: boolean) {
  let deg = (Math.atan2(p.y - r.y, p.x - r.x) * 180) / Math.PI;
  if (steps) deg = Math.round(deg / 15) * 15;
  else {
    const near = Math.round(deg / 45) * 45;
    if (Math.abs(deg - near) < 2.5) deg = near;
  }
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  return Math.round(deg * 10) / 10;
}

/** Shown angle: 0–180°, as a protractor reads a line. */
export const shownAngle = (deg: number) => {
  const a = ((Math.round(-deg) % 180) + 180) % 180;
  return a;
};

export function RulerView({ ruler, zoom }: { ruler: Ruler; zoom: number }) {
  const half = RULER_LENGTH / 2,
    h = RULER_HEIGHT;
  const ticks: React.ReactNode[] = [];
  for (let mm = 0; mm <= 160; mm++) {
    const x = -half + mm * MM;
    const long = mm % 10 === 0 ? 16 : mm % 5 === 0 ? 11 : 6;
    ticks.push(
      <line key={`t${mm}`} x1={x} y1={-h / 2} x2={x} y2={-h / 2 + long} />,
      <line key={`b${mm}`} x1={x} y1={h / 2} x2={x} y2={h / 2 - long} />,
    );
    if (mm % 10 === 0)
      ticks.push(
        <text key={`n${mm}`} x={x} y={-h / 2 + 27} textAnchor="middle">
          {mm / 10}
        </text>,
      );
  }
  return (
    <g
      className="note-ruler"
      transform={`translate(${ruler.x} ${ruler.y}) rotate(${ruler.angle})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <rect
        x={-half}
        y={-h / 2}
        width={RULER_LENGTH}
        height={h}
        rx={6}
        fill="rgb(230 240 252 / 72%)"
        stroke="#5b7fa8"
        strokeWidth={1 / zoom}
      />
      <g stroke="#3b5f88" strokeWidth={0.8}>
        {ticks}
      </g>
      <text x={0} y={h / 2 - 16} textAnchor="middle" className="note-ruler-angle">
        {shownAngle(ruler.angle)}°
      </text>
      <circle cx={half - 30} cy={0} r={KNOB} fill="#ffffff" stroke="#0056a6" strokeWidth={2} />
      <path
        d={`M ${half - 36} -3 a 6 6 0 1 1 6 9 M ${half - 30} 6 l -3 -4 M ${half - 30} 6 l 4 -2`}
        fill="none"
        stroke="#0056a6"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  );
}
