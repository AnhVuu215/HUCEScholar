import { test, expect } from './helpers/test';
import {
  pagePointToPosition,
  positionToViewport,
  quadBounds,
  rectToQuad,
  type HighlightViewport,
} from '../apps/web/lib/highlight-geometry';

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
    // READ-04: a pinned note's point maps to the same place on the page at every rotation,
    // also when the page is drawn at another CSS size than its viewport.
    // PDF point (20, 200) of the crop box [10 20 110 220], drawn at scale 2.
    const pin = positionToViewport({ x: 0.1, y: 0.9 }, viewport);
    const corner = { 0: [20, 40], 90: [360, 20], 180: [180, 360], 270: [40, 180] }[angle]!;
    expect(pin.left).toBeCloseTo(corner[0], 6);
    expect(pin.top).toBeCloseTo(corner[1], 6);
    const element = {
      getBoundingClientRect: () => ({
        left: 5,
        top: 7,
        width: viewport.width / 2,
        height: viewport.height / 2,
      }),
    } as unknown as HTMLDivElement;
    expect(pagePointToPosition(5 + pin.left / 2, 7 + pin.top / 2, { element, viewport })).toEqual({
      x: 0.1,
      y: 0.9,
    });
    // Points outside the page are clamped onto it.
    expect(pagePointToPosition(-50, -50, { element, viewport })).toEqual(
      pagePointToPosition(5, 7, { element, viewport }),
    );
  });
}
