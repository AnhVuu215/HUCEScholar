import type { Block, Run } from '../../lib/note-model';

/**
 * Converts between a text box's blocks and the contenteditable DOM used while typing. Building
 * the DOM uses text nodes only; reading it keeps just paragraphs, lists, bold/italic/underline/
 * strike and color, so pasted or browser-made markup never becomes stored HTML.
 */
type Format = Omit<Run, 't'>;

export function blocksToDom(blocks: Block[], doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const fill = (target: HTMLElement, block: Block) => {
    if (!block.runs.length) {
      target.appendChild(doc.createElement('br'));
      return;
    }
    for (const run of block.runs) {
      let node: Node = doc.createTextNode(run.t);
      const wrap = (tag: string) => {
        const element = doc.createElement(tag);
        element.appendChild(node);
        node = element;
      };
      if (run.b) wrap('b');
      if (run.i) wrap('i');
      if (run.u) wrap('u');
      if (run.s) wrap('s');
      if (run.c) {
        const span = doc.createElement('span');
        span.style.color = run.c;
        span.appendChild(node);
        node = span;
      }
      target.appendChild(node);
    }
  };
  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];
    if (block.list) {
      const list = doc.createElement(block.list);
      for (; i < blocks.length && blocks[i].list === block.list; i++) {
        const li = doc.createElement('li');
        fill(li, blocks[i]);
        list.appendChild(li);
      }
      fragment.appendChild(list);
    } else {
      const div = doc.createElement('div');
      fill(div, block);
      fragment.appendChild(div);
      i++;
    }
  }
  return fragment;
}

function hex(color: string): string | undefined {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value))
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (rgb)
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
      .join('')}`;
  return undefined;
}
function formatOf(element: HTMLElement, inherited: Format): Format {
  const next: Format = { ...inherited };
  const tag = element.tagName;
  if (tag === 'B' || tag === 'STRONG') next.b = true;
  if (tag === 'I' || tag === 'EM') next.i = true;
  if (tag === 'U' || tag === 'INS') next.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.s = true;
  if (tag === 'FONT' && element.getAttribute('color')) {
    const c = hex(element.getAttribute('color')!);
    if (c) next.c = c;
  }
  const style = element.style;
  if (style) {
    const weight = style.fontWeight;
    if (weight === 'bold' || Number(weight) >= 600) next.b = true;
    else if (weight === 'normal' || (weight && Number(weight) < 600)) delete next.b;
    if (style.fontStyle === 'italic') next.i = true;
    const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
    if (decoration.includes('underline')) next.u = true;
    if (decoration.includes('line-through')) next.s = true;
    if (style.color) {
      const c = hex(style.color);
      if (c) next.c = c;
    }
  }
  return next;
}
const BLOCK = new Set([
  'DIV',
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
]);
const LIST = new Set(['UL', 'OL']);

function pushRun(runs: Run[], t: string, format: Format) {
  if (!t) return;
  const last = runs[runs.length - 1];
  const same =
    last &&
    !!last.b === !!format.b &&
    !!last.i === !!format.i &&
    !!last.u === !!format.u &&
    !!last.s === !!format.s &&
    last.c === format.c;
  if (same) last.t += t;
  else {
    const run: Run = { t };
    if (format.b) run.b = true;
    if (format.i) run.i = true;
    if (format.u) run.u = true;
    if (format.s) run.s = true;
    if (format.c) run.c = format.c;
    runs.push(run);
  }
}
function finish(runs: Run[]): Run[] {
  // A trailing <br> (or the line break the browser keeps after one) is not part of the text.
  const last = runs[runs.length - 1];
  if (last && last.t.endsWith('\n')) {
    last.t = last.t.slice(0, -1);
    if (!last.t) runs.pop();
  }
  return runs;
}

export function domToBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = [];
  let current: Run[] | null = null;
  const flush = () => {
    if (current) blocks.push({ list: null, runs: finish(current) });
    current = null;
  };
  const inline = (node: Node, format: Format, runs: Run[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushRun(runs, (node.textContent ?? '').replace(/ /g, ' ').replace(/​/g, ''), format);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      pushRun(runs, '\n', format);
      return;
    }
    const next = formatOf(node, format);
    node.childNodes.forEach((child) => inline(child, next, runs));
  };
  const walk = (parent: Node, format: Format) => {
    parent.childNodes.forEach((node) => {
      if (node instanceof HTMLElement && LIST.has(node.tagName)) {
        flush();
        const list = node.tagName === 'OL' ? 'ol' : 'ul';
        node.childNodes.forEach((li) => {
          if (!(li instanceof HTMLElement)) return;
          const runs: Run[] = [];
          const nested: HTMLElement[] = [];
          li.childNodes.forEach((child) => {
            if (child instanceof HTMLElement && LIST.has(child.tagName)) nested.push(child);
            else inline(child, formatOf(li, format), runs);
          });
          blocks.push({ list, runs: finish(runs) });
          // A nested list is flattened into the same list.
          nested.forEach((n) => walk(n.parentElement === li ? wrapList(n) : n, format));
        });
        return;
      }
      if (node instanceof HTMLElement && BLOCK.has(node.tagName)) {
        flush();
        const hasBlocks = Array.from(node.children).some(
          (child) => BLOCK.has(child.tagName) || LIST.has(child.tagName),
        );
        if (hasBlocks) walk(node, formatOf(node, format));
        else {
          const runs: Run[] = [];
          inline(node, format, runs);
          blocks.push({ list: null, runs: finish(runs) });
        }
        return;
      }
      if (node instanceof HTMLElement && node.tagName === 'BR') {
        if (!current) current = [];
        flush();
        return;
      }
      current ??= [];
      inline(node, format, current);
    });
  };
  const wrapList = (list: HTMLElement) => {
    const holder = list.ownerDocument.createElement('div');
    holder.appendChild(list.cloneNode(true));
    return holder;
  };
  walk(root, {});
  flush();
  return blocks.length ? blocks : [{ list: null, runs: [] }];
}
