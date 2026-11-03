import { expect, test, type Page } from './helpers/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { crc32, deflateSync } from 'node:zlib';
import { readerHeaders, readerLogin } from './helpers/reader-session';

/**
 * PERF-01 for CANVAS-01. Opt-in (`PERF=1`): one notebook page with `PERF_STROKES` strokes
 * (2 000) and `PERF_IMAGES` images (20), measured with an emulated slow CPU. Numbers are a
 * reference from `next dev` on loopback, not targets.
 */
test.skip(process.env.PERF !== '1', 'Opt-in: PERF=1 seeds a heavy notebook page.');

const strokes = Number(process.env.PERF_STROKES ?? 2000);
const images = Number(process.env.PERF_IMAGES ?? 20);
const cpuSlowdown = Number(process.env.PERF_CPU ?? 4);
const runs = 3;
const label = process.env.PERF_LABEL ?? 'baseline';

/** A noisy RGB PNG so the WebP re-encode is not trivially small. */
function png(width: number, height: number, seed: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let s = seed * 9973 + 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / width;
      raw[o + 1] = (y * 255) / height;
      raw[o + 2] = s & 0xff;
    }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Handwriting-like strokes over an A4 page: short wavy words in rows. */
function strokeItems(count: number) {
  const tools = ['ballpoint', 'ballpoint', 'ballpoint', 'fountain', 'highlighter', 'pencil'];
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / 40) % 45,
      col = i % 40;
    const x0 = 40 + col * 18,
      y0 = 40 + row * 23;
    const points: number[] = [];
    for (let k = 0; k < 36; k++)
      points.push(
        Math.round((x0 + k * 0.45) * 10) / 10,
        Math.round((y0 + Math.sin(k / 2 + i) * 6) * 10) / 10,
        0.5,
      );
    const tool = tools[i % tools.length];
    return {
      id: `s${i}`,
      type: 'stroke',
      tool,
      color: tool === 'highlighter' ? '#fde047' : '#1d4ed8',
      width: tool === 'highlighter' ? 14 : 2,
      points,
    };
  });
}

function database() {
  const environment = parseEnv(readFileSync('.local/test.env', 'utf8'));
  const url = new URL(environment.TEST_DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) throw new Error('Isolated test database required.');
  const { Client } = createRequire(`${process.cwd()}/apps/api/package.json`)('pg');
  return new Client({ connectionString: url.href });
}
const summary = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
    maxMs: Math.round(sorted.at(-1)!),
    samplesMs: samples.map(Math.round),
  };
};

/** Records frame gaps and long tasks in the page until `stop` returns them. */
async function startFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number[]; __run: boolean };
    w.__frames = [];
    w.__long = [];
    w.__run = true;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const o = window as unknown as { __observer?: PerformanceObserver };
    o.__observer?.disconnect();
    o.__observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    });
    o.__observer.observe({ type: 'longtask' });
  });
}
async function stopFrames(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number[]; __run: boolean };
    w.__run = false;
    const f = w.__frames.slice(1).sort((a, b) => a - b);
    return {
      frames: f.length,
      p50Ms: Math.round(f[Math.floor(f.length * 0.5)] ?? 0),
      p95Ms: Math.round(f[Math.floor(f.length * 0.95)] ?? 0),
      maxMs: Math.round(f.at(-1) ?? 0),
      longTasks: w.__long.length,
      longestTaskMs: Math.round(Math.max(0, ...w.__long)),
    };
  });
}

/** Ink is on screen: every stroke as a path, or every raster run painted, and images decoded. */
async function inkShown(page: Page, strokes: number) {
  await page.waitForFunction(
    (n) => {
      const svg = document.querySelector('svg.note-surface');
      if (!svg) return false;
      const runs = Array.from(svg.querySelectorAll('[data-note-raster]'));
      const inRuns = runs.reduce((a, g) => a + Number(g.getAttribute('data-note-raster')), 0);
      const paths = svg.querySelectorAll('path').length;
      return (
        runs.every((g) => g.hasAttribute('data-ready')) &&
        inRuns + paths >= n &&
        svg.querySelectorAll('image').length >= 1
      );
    },
    strokes,
    { timeout: 120_000 },
  );
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.querySelectorAll('svg.note-surface image')).map((i) =>
        (i as unknown as { decode(): Promise<void> }).decode().catch(() => undefined),
      ),
    ),
  );
}

/** One long stroke (a sentence of handwriting) with the pen; frame gaps while drawing it. */
async function longStroke(page: Page, moves: number) {
  await page.locator('.note-tool[data-tool="pen"]').click();
  const box = (await page.locator('svg.note-surface').boundingBox())!;
  const x = box.x + box.width * 0.15,
    y = box.y + box.height * 0.6;
  await startFrames(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= moves; k++)
    await page.mouse.move(x + (k / moves) * box.width * 0.7, y + Math.sin(k / 4) * 14);
  await page.mouse.up();
  return stopFrames(page);
}

test('notebook page with thousands of strokes and images', async ({ page, browser }) => {
  test.setTimeout(600_000);
  await page.goto('/login');
  await readerLogin(page, 'student', 'perf');
  const headers = await readerHeaders(page);
  const created = await page.request.post('/api/v1/notebooks', {
    headers,
    data: {
      title: `PERF vở ${randomUUID().slice(0, 6)}`,
      cover: 'navy',
      courseId: null,
      defaultSize: 'A4_PORTRAIT',
      defaultPaper: 'O_LI',
      defaultColor: 'white',
      requestId: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const detail = await created.json();
  const notebookId = detail.item.id as string,
    pageId = detail.pages[0].id as string,
    revision = detail.pages[0].revision as number;

  const assetIds: string[] = [];
  for (let i = 0; i < images; i++) {
    const upload = await page.request.post('/api/v1/notebook-assets', {
      headers: { ...headers, 'Content-Type': 'image/png', 'X-Upload-Id': randomUUID() },
      data: png(1200, 800, i),
    });
    expect(upload.status(), await upload.text()).toBe(201);
    assetIds.push((await upload.json()).item.id);
  }
  // No ClamAV in this run: the scan result is set in the isolated test DB.
  const db = database();
  await db.connect();
  try {
    await db.query(
      "UPDATE hucescholar.notebook_assets SET scan_status='SAFE' WHERE id=ANY($1::bigint[])",
      [assetIds],
    );
  } finally {
    await db.end();
  }

  const content = {
    v: 1,
    items: [
      ...assetIds.map((assetId, i) => ({
        id: `i${i}`,
        type: 'image',
        assetId,
        x: 30 + (i % 4) * 185,
        y: 30 + Math.floor(i / 4) * 210,
        w: 180,
        h: 120,
        rot: 0,
        crop: null,
      })),
      ...strokeItems(strokes),
    ],
  };
  const body = JSON.stringify(content);
  const saved = await page.request.put(`/api/v1/notebooks/${notebookId}/pages/${pageId}/content`, {
    headers: {
      ...headers,
      'Content-Type': 'application/vnd.hucescholar.page+json',
      'If-Match': `"${revision}"`,
    },
    data: body,
  });
  expect(saved.status(), await saved.text()).toBe(200);

  // Server side of an autosave of this page, without the client's 1 s idle delay.
  const apiSaves: number[] = [];
  let rev = (await saved.json()).revision as number;
  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    const again = await page.request.put(
      `/api/v1/notebooks/${notebookId}/pages/${pageId}/content`,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/vnd.hucescholar.page+json',
          'If-Match': `"${rev}"`,
        },
        data: body,
      },
    );
    expect(again.status()).toBe(200);
    rev = (await again.json()).revision;
    apiSaves.push(Date.now() - t0);
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  const route = `/workspace/notes/${notebookId}?page=${pageId}`;
  const report: Record<string, unknown> = {
    label,
    strokes,
    images,
    cpuSlowdown,
    pageBytes: Buffer.byteLength(body),
    startedAt: new Date().toISOString(),
  };

  // Warm-up (compiles the route in next dev), then timed opens.
  await page.goto(route);
  await expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 120_000 });
  // PERF_TRACE=1: a Chromium trace of one open and one stroke with its autosave.
  if (process.env.PERF_TRACE === '1') {
    mkdirSync('test-results/perf', { recursive: true });
    const profiler = await page.context().newCDPSession(page);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.setSamplingInterval', { interval: 200 });
    await profiler.send('Profiler.start');
    await browser.startTracing(page, {
      path: `test-results/perf/notebook-${label}-trace.json`,
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute'],
    });
    await page.goto(route);
    await inkShown(page, strokes);
    await page.waitForTimeout(3000);
    const box = (await page.locator('svg.note-surface').boundingBox())!;
    await page.locator('.note-tool[data-tool="pen"]').click();
    await page.mouse.move(box.x + 200, box.y + 300);
    await page.mouse.down();
    for (let k = 1; k <= 60; k++)
      await page.mouse.move(box.x + 200 + k * 4, box.y + 300 + Math.sin(k / 3) * 10);
    await page.mouse.up();
    await expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 60_000 });
    await browser.stopTracing();
    const { profile } = await profiler.send('Profiler.stop');
    writeFileSync(`test-results/perf/notebook-${label}.cpuprofile`, JSON.stringify(profile));
    await profiler.detach();
  }
  const opens: number[] = [];
  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    await page.goto(route);
    await expect(page.locator('svg.note-surface')).toBeVisible({ timeout: 120_000 });
    await inkShown(page, strokes);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    opens.push(Date.now() - t0);
  }
  report.open = summary(opens);
  // The same editor on an empty page: the fixed cost of the route, session and bundles.
  const empty = await page.request.post('/api/v1/notebooks', {
    headers: await readerHeaders(page),
    data: {
      title: `PERF trống ${randomUUID().slice(0, 6)}`,
      cover: 'navy',
      courseId: null,
      defaultSize: 'A4_PORTRAIT',
      defaultPaper: 'O_LI',
      defaultColor: 'white',
      requestId: randomUUID(),
    },
  });
  const emptyDetail = await empty.json();
  const emptyRoute = `/workspace/notes/${emptyDetail.item.id}?page=${emptyDetail.pages[0].id}`;
  const emptyOpens: number[] = [];
  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    await page.goto(emptyRoute);
    await expect(page.locator('svg.note-surface')).toBeVisible({ timeout: 120_000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    emptyOpens.push(Date.now() - t0);
  }
  report.openEmptyPage = summary(emptyOpens);
  report.longStrokeEmptyPage = [await longStroke(page, 400), await longStroke(page, 400)];
  await page.request.delete(`/api/v1/notebooks/${emptyDetail.item.id}`, {
    headers: await readerHeaders(page),
    data: { revision: emptyDetail.item.revision },
  });
  await page.request.delete(`/api/v1/notebooks/${emptyDetail.item.id}/permanent`, {
    headers: await readerHeaders(page),
  });
  // Reading the heavy page from the API, without rendering it.
  const reads: number[] = [];
  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    expect(
      (await page.request.get(`/api/v1/notebooks/${notebookId}/pages/${pageId}`)).status(),
    ).toBe(200);
    reads.push(Date.now() - t0);
  }
  report.apiRead = summary(reads);
  await page.goto(route);
  await inkShown(page, strokes);
  report.apiSave = summary(apiSaves);

  const surface = (await page.locator('svg.note-surface').boundingBox())!;
  await page.locator('.note-tool[data-tool="pen"]').click();
  const drawing: unknown[] = [];
  const autosave: number[] = [];
  for (let r = 0; r < runs; r++) {
    const x = surface.x + surface.width * 0.3,
      y = surface.y + surface.height * (0.3 + r * 0.1);
    await startFrames(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 60; k++) await page.mouse.move(x + k * 4, y + Math.sin(k / 3) * 10);
    await page.mouse.up();
    const t0 = Date.now();
    drawing.push(await stopFrames(page));
    await expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 60_000 });
    autosave.push(Date.now() - t0);
  }
  report.drawStroke = drawing;
  report.longStrokeBusyPage = [await longStroke(page, 400)];
  await expect(page.locator('.note-save')).toHaveText('Đã lưu', { timeout: 60_000 });
  report.autosaveAfterStroke = summary(autosave);

  // Ctrl + wheel zoom in and out, then a pan with the hand tool.
  await page.locator('.note-tool[data-tool="hand"]').click();
  const zooming: unknown[] = [];
  for (let r = 0; r < runs; r++) {
    await page.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2);
    await startFrames(page);
    await page.keyboard.down('Control');
    for (let k = 0; k < 8; k++) await page.mouse.wheel(0, -120);
    for (let k = 0; k < 8; k++) await page.mouse.wheel(0, 120);
    await page.keyboard.up('Control');
    await page.mouse.down();
    for (let k = 1; k <= 30; k++)
      await page.mouse.move(
        surface.x + surface.width / 2 + k * 6,
        surface.y + surface.height / 2 + k * 3,
      );
    await page.mouse.up();
    zooming.push(await stopFrames(page));
  }
  report.zoomAndPan = zooming;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // PERF_SHOT=1: the raster tiles next to the vector print view of the same page.
  if (process.env.PERF_SHOT === '1') {
    await page.setViewportSize({ width: 1400, height: 1100 });
    await page.goto(route);
    await inkShown(page, strokes);
    const canvas = page.locator('svg.note-surface');
    await canvas.screenshot({ path: `test-results/perf/notebook-${label}-fit.png` });
    // Ctrl + wheel around a dense spot of ink (top-left rows of the page).
    const box = (await canvas.boundingBox())!;
    await canvas.evaluate(
      (node, at) => {
        for (let k = 0; k < 8; k++)
          node.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: -120,
              ctrlKey: true,
              clientX: at.x,
              clientY: at.y,
              bubbles: true,
              cancelable: true,
            }),
          );
      },
      { x: box.x + box.width * 0.3, y: box.y + box.height * 0.18 },
    );
    await page.waitForTimeout(500);
    await inkShown(page, strokes);
    await page.waitForTimeout(300);
    await canvas.screenshot({ path: `test-results/perf/notebook-${label}-zoom.png` });
    await page.goto(`/workspace/notes/${notebookId}/print`);
    await expect(page.locator('.note-print-page')).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page
      .locator('.note-print-page')
      .screenshot({ path: `test-results/perf/notebook-${label}-vector.png` });
  }
  report.finishedAt = new Date().toISOString();
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync(`test-results/perf/notebook-${label}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const cleanup = await readerHeaders(page);
  const current = await (await page.request.get(`/api/v1/notebooks/${notebookId}`)).json();
  await page.request.delete(`/api/v1/notebooks/${notebookId}`, {
    headers: cleanup,
    data: { revision: current.item.revision },
  });
  expect(
    (
      await page.request.delete(`/api/v1/notebooks/${notebookId}/permanent`, { headers: cleanup })
    ).status(),
  ).toBe(204);
});
