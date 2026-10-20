import { test, expect } from './helpers/test';
import { quadBounds, rectToQuad, type HighlightViewport } from '../apps/web/lib/highlight-geometry';

const quad = [0.1, 0.9, 0.3, 0.9, 0.3, 0.8, 0.1, 0.8];
// Independent PDF viewport fixtures: nonzero crop origin, both PDF axes, four rotations.
for (const angle of [0, 90, 180, 270]) {
  test(`highlight geometry retains the crop origin at rotation ${angle}`, () => {
    const viewport: HighlightViewport = {
      viewBox: [10, 20, 110, 220],
      width: angle % 180 ? 400 : 200,
      height: angle % 180 ? 200 : 400,
      convertToViewportPoint(x, y) {
        if (angle === 90) return [(y - 20) * 2, (x - 10) * 2];
        if (angle === 180) return [(110 - x) * 2, (y - 20) * 2];
        if (angle === 270) return [(220 - y) * 2, (110 - x) * 2];
        return [(x - 10) * 2, (220 - y) * 2];
      },
      convertToPdfPoint(x, y) {
        if (angle === 90) return [y / 2 + 10, x / 2 + 20];
        if (angle === 180) return [110 - x / 2, y / 2 + 20];
        if (angle === 270) return [110 - y / 2, 220 - x / 2];
        return [x / 2 + 10, 220 - y / 2];
      },
    };
    const expected =
      angle === 0
        ? { left: 20, top: 40, width: 40, height: 40 }
        : angle === 90
          ? { left: 320, top: 20, width: 40, height: 40 }
          : angle === 180
            ? { left: 140, top: 320, width: 40, height: 40 }
            : { left: 40, top: 140, width: 40, height: 40 };
    const result = quadBounds(quad, viewport);
    for (const key of ['left', 'top', 'width', 'height'] as const)
      expect(result[key]).toBeCloseTo(expected[key], 6);
    const points = rectToQuad(
      {
        ...expected,
        right: expected.left + expected.width,
        bottom: expected.top + expected.height,
      },
      viewport,
    );
    const pairs = (q: number[]) => [0, 2, 4, 6].map((i) => `${q[i]},${q[i + 1]}`).sort();
    expect(pairs(points)).toEqual(pairs(quad));
  });
}
