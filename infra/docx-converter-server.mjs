import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const max = 25 * 1024 * 1024;
const build = execFileSync('soffice', ['--version'], { timeout: 10000, encoding: 'utf8' })
  .trim()
  .replace(/[^\x20-\x7e]/g, '')
  .slice(0, 160);
let active = false;
function run(binary, args, timeout, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      detached: true,
      stdio: 'ignore',
      shell: false,
      env: { PATH: process.env.PATH, HOME: '/tmp', TMPDIR: '/tmp', LANG: 'C.UTF-8' },
    });
    let killed = false;
    const kill = () => {
      killed = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const timer = setTimeout(kill, timeout);
    signal.addEventListener('abort', kill, { once: true });
    if (signal.aborted) kill();
    child.once('error', () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      reject(new Error('PROCESSOR_UNAVAILABLE'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (killed) reject(new Error('CONVERSION_TIMEOUT'));
      else if (code !== 0)
        reject(new Error(binary === 'python3' ? 'INVALID_DOCX' : 'CONVERSION_FAILED'));
      else resolve();
    });
  });
}
createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.url === '/health') {
    res.end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/convert') {
    res.writeHead(404).end();
    return;
  }
  if (active) {
    res.writeHead(429).end();
    return;
  }
  active = true;
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableFinished) controller.abort();
  };
  res.once('close', abort);
  let directory;
  let size = 0;
  try {
    directory = await mkdtemp('/tmp/docx-');
    const source = directory + '/document.docx';
    const profile = directory + '/profile';
    const guard = new Transform({
      transform(chunk, _, callback) {
        size += chunk.length;
        callback(size > max ? new Error('FILE_TOO_LARGE') : null, chunk);
      },
    });
    await pipeline(req, guard, createWriteStream(source, { flags: 'wx', mode: 0o600 }), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
    });
    await run('python3', ['/app/validate-docx.py', source], 20000, controller.signal);
    await mkdir(profile + '/user', { recursive: true });
    await writeFile(
      profile + '/user/registrymodifications.xcu',
      `<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>`,
    );
    await run(
      'soffice',
      [
        '-env:UserInstallation=' + pathToFileURL(profile).href,
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf:writer_pdf_Export',
        '--outdir',
        directory,
        source,
      ],
      120000,
      controller.signal,
    );
    const output = directory + '/document.pdf';
    const info = await stat(output);
    if (!info.size || info.size > max) throw new Error('CONVERSION_FAILED');
    const bytes = await readFile(output);
    if (!bytes.subarray(0, 8).toString('ascii').startsWith('%PDF-'))
      throw new Error('CONVERSION_FAILED');
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': bytes.length,
      'X-Converter-Build': build,
    });
    res.end(bytes);
  } catch (error) {
    const code = [
      'INVALID_DOCX',
      'CONVERSION_TIMEOUT',
      'FILE_TOO_LARGE',
      'PROCESSOR_UNAVAILABLE',
    ].includes(error.message)
      ? error.message
      : 'CONVERSION_FAILED';
    if (!res.headersSent && !res.destroyed)
      res
        .writeHead(code === 'INVALID_DOCX' ? 422 : 503, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ code }));
  } finally {
    if (directory)
      await rm(directory, { recursive: true, force: true }).catch(() =>
        process.stderr.write('Converter temporary cleanup required\n'),
      );
    res.off('close', abort);
    active = false;
  }
}).listen(8080, '0.0.0.0', () => process.stdout.write('Isolated DOCX converter ready\n'));
