// Safe renderer for the starlog-md-1 Markdown subset (see spec/README.md).
//
// Supported: ATX headings (#-###), paragraphs, hard breaks (two trailing
// spaces), fenced code blocks (``` with optional info string), single-level
// blockquotes, nested unordered/ordered lists, thematic breaks, inline
// emphasis (* ** _ __), inline code, https:// links and <https://> autolinks.
//
// Safety: renders to React nodes, so all text is escaped by construction.
// Raw HTML is never interpreted. External images `![](...)` render as
// literal text. Links allow https:// only; anything else renders literally.
// Excluded constructs (tables, strikethrough, task lists, footnotes,
// setext headings, indented code, reference links) get no special handling
// and render as plain text.

import { createElement, type ReactNode } from 'react';

// ---------- inline parsing ----------

type InlineToken =
  | { t: 'text'; s: string }
  | { t: 'code'; s: string }
  | { t: 'em'; children: InlineToken[] }
  | { t: 'strong'; children: InlineToken[] }
  | { t: 'link'; href: string; children: InlineToken[] }
  | { t: 'br' };

const HTTPS_RE = /^https:\/\/[^\s<>"')\]]+/;

function isHttpsUrl(u: string): boolean {
  return /^https:\/\/[^\s<>"']+$/.test(u);
}

/** Find the index of the closing run of `ch` (len 1 or 2) at/after i. */
function findCloser(s: string, i: number, marker: string): number {
  // marker is '*' or '**' or '_' or '__'
  let j = i + marker.length;
  while (j <= s.length - marker.length) {
    const k = s.indexOf(marker[0], j);
    if (k === -1) return -1;
    if (marker.length === 2) {
      if (s[k + 1] === marker[0]) return k;
      j = k + 1;
    } else {
      // single marker: don't match the first char of a double run
      if (s[k + 1] === marker[0]) {
        j = k + 2;
        continue;
      }
      return k;
    }
  }
  return -1;
}

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}_]/u.test(c);
}

export function parseInline(src: string): InlineToken[] {
  const out: InlineToken[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', s: buf });
      buf = '';
    }
  };

  while (i < src.length) {
    const c = src[i];

    // inline code span
    if (c === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      const close = src.indexOf('`'.repeat(n), i + n);
      if (close !== -1) {
        flush();
        out.push({ t: 'code', s: src.slice(i + n, close) });
        i = close + n;
        continue;
      }
      buf += c;
      i++;
      continue;
    }

    // autolink <https://...>
    if (c === '<') {
      const m = HTTPS_RE.exec(src.slice(i + 1));
      if (m && src[i + 1 + m[0].length] === '>') {
        flush();
        const href = m[0];
        out.push({ t: 'link', href, children: [{ t: 'text', s: href }] });
        i += 1 + m[0].length + 1;
        continue;
      }
      buf += c;
      i++;
      continue;
    }

    // image: ![...](...) -> literal text (no external media, ever)
    if (c === '!' && src[i + 1] === '[') {
      const end = matchBracketPair(src, i + 1);
      if (end !== -1) {
        flush();
        out.push({ t: 'text', s: src.slice(i, end + 1) });
        i = end + 1;
        continue;
      }
      buf += c;
      i++;
      continue;
    }

    // link [text](url)
    if (c === '[') {
      const end = matchBracketPair(src, i);
      if (end !== -1 && src[end + 1] === '(') {
        const closeParen = src.indexOf(')', end + 2);
        if (closeParen !== -1) {
          const rawUrl = src.slice(end + 2, closeParen).trim();
          const url = rawUrl.replace(/^<|>$/g, '');
          const inner = src.slice(i + 1, end);
          if (isHttpsUrl(url)) {
            flush();
            out.push({ t: 'link', href: url, children: parseInline(inner) });
          } else {
            flush();
            out.push({ t: 'text', s: src.slice(i, closeParen + 1) });
          }
          i = closeParen + 1;
          continue;
        }
      }
      buf += c;
      i++;
      continue;
    }

    // emphasis: ** __ * _
    if (c === '*' || c === '_') {
      const double = src[i + 1] === c;
      const marker = double ? c + c : c;
      // intra-word _ does not open/close emphasis (CommonMark-ish)
      const prev = src[i - 1];
      const next = src[i + marker.length];
      if (c === '_' && !double && isWordChar(prev) && isWordChar(next)) {
        buf += c;
        i++;
        continue;
      }
      const k = findCloser(src, i, marker);
      if (k !== -1) {
        flush();
        const children = parseInline(src.slice(i + marker.length, k));
        out.push(double ? { t: 'strong', children } : { t: 'em', children });
        i = k + marker.length;
        continue;
      }
      buf += c;
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Index of the `]` matching the `[` at i (no nesting), or -1. */
function matchBracketPair(s: string, i: number): number {
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') {
      j += 2;
      continue;
    }
    if (s[j] === ']') return j;
    if (s[j] === '[' || s[j] === '\n') return -1;
    j++;
  }
  return -1;
}

function renderInline(tokens: InlineToken[], keyPrefix: string): ReactNode[] {
  return tokens.map((tok, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (tok.t) {
      case 'text':
        return tok.s;
      case 'br':
        return createElement('br', { key });
      case 'code':
        return createElement('code', { key }, tok.s);
      case 'em':
        return createElement('em', { key }, ...renderInline(tok.children, key));
      case 'strong':
        return createElement('strong', { key }, ...renderInline(tok.children, key));
      case 'link':
        return createElement(
          'a',
          {
            key,
            href: tok.href,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          ...renderInline(tok.children, key),
        );
    }
  });
}

// ---------- block parsing ----------

type Block =
  | { t: 'heading'; level: 1 | 2 | 3; text: string }
  | { t: 'para'; lines: string[] }
  | { t: 'code'; info: string; text: string }
  | { t: 'quote'; lines: string[] }
  | { t: 'hr' }
  | { t: 'list'; ordered: boolean; items: ListItem[] };

interface ListItem {
  lines: string[];
  children: Block[]; // nested list blocks
}

const HR_RE = /^\s{0,3}(---|\*\*\*|___)\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^\s{0,3}```(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const BLANK_RE = /^\s*$/;

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (BLANK_RE.test(line)) {
      i++;
      continue;
    }

    // fenced code
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const info = fence[1].trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      blocks.push({ t: 'code', info, text: buf.join('\n') });
      continue;
    }

    // thematic break (before list: "---" and "***" collide)
    if (HR_RE.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    // ATX heading
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({
        t: 'heading',
        level: h[1].length as 1 | 2 | 3,
        text: h[2],
      });
      i++;
      continue;
    }

    // blockquote (single level; gather consecutive quote lines)
    if (QUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const q = QUOTE_RE.exec(lines[i]);
        if (!q) break;
        buf.push(q[1]);
        i++;
      }
      blocks.push({ t: 'quote', lines: buf });
      continue;
    }

    // list
    const lm = LIST_RE.exec(line);
    if (lm) {
      const { block, next } = parseList(lines, i, lm[1].length);
      blocks.push(block);
      i = next;
      continue;
    }

    // paragraph: consecutive non-blank, non-special lines
    const buf: string[] = [];
    while (
      i < lines.length &&
      !BLANK_RE.test(lines[i]) &&
      !FENCE_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !LIST_RE.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ t: 'para', lines: buf });
  }

  return blocks;
}

function parseList(
  lines: string[],
  start: number,
  baseIndent: number,
): { block: Block; next: number } {
  const items: ListItem[] = [];
  let i = start;
  let ordered: boolean | null = null;

  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (!m) break;
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) break; // handled as child by the item loop below

    const isOrdered = /\d/.test(m[2][0]);
    if (ordered === null) ordered = isOrdered;
    else if (ordered !== isOrdered) break; // different list type: new block

    const itemLines: string[] = [m[3]];
    i++;
    // continuation lines: indented content belonging to this item
    const childLines: string[] = [];
    while (i < lines.length) {
      const cl = lines[i];
      if (BLANK_RE.test(cl)) {
        // blank ends item unless followed by deeper content; keep simple: end
        break;
      }
      const cm = LIST_RE.exec(cl);
      if (cm && cm[1].length > baseIndent) {
        childLines.push(cl);
        i++;
        continue;
      }
      if (cm) break; // sibling or outer
      // indented continuation text
      if (/^\s+/.test(cl) && cl.length > baseIndent) {
        itemLines.push(cl.trim());
        i++;
        continue;
      }
      break;
    }
    const children: Block[] = [];
    if (childLines.length > 0) {
      // re-indent child lines relative to their own base
      const childBase = Math.min(
        ...childLines.map((l) => LIST_RE.exec(l)![1].length),
      );
      const dedented = childLines.map((l) => l.slice(childBase));
      const { block } = parseList(dedented, 0, 0);
      children.push(block);
    }
    items.push({ lines: itemLines, children });
  }

  return { block: { t: 'list', ordered: ordered ?? false, items }, next: i };
}

function renderParaLines(lines: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((ln, li) => {
    const hardBreak = / {2,}$/.test(ln);
    const text = hardBreak ? ln.replace(/ {2,}$/, '') : ln;
    if (li > 0) out.push(' ');
    out.push(...renderInline(parseInline(text), `${key}-l${li}`));
    if (hardBreak) out.push(createElement('br', { key: `${key}-br${li}` }));
  });
  return out;
}

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((b, bi) => {
    const key = `${keyPrefix}-b${bi}`;
    switch (b.t) {
      case 'heading': {
        const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3';
        return createElement(Tag, { key }, ...renderInline(parseInline(b.text), key));
      }
      case 'para':
        return createElement('p', { key }, ...renderParaLines(b.lines, key));
      case 'code':
        return createElement(
          'pre',
          { key },
          createElement('code', { 'data-info': b.info || undefined }, b.text),
        );
      case 'quote': {
        // single-level: inner content parsed as blocks, quotes inside stay text
        const inner = parseBlocks(
          b.lines.map((l) => (l.startsWith('>') ? l.slice(1) : l)),
        );
        return createElement('blockquote', { key }, ...renderBlocks(inner, key));
      }
      case 'hr':
        return createElement('hr', { key });
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul';
        return createElement(
          Tag,
          { key },
          ...b.items.map((item, ii) =>
            createElement(
              'li',
              { key: `${key}-i${ii}` },
              ...renderInline(parseInline(item.lines.join(' ')), `${key}-i${ii}`),
              ...renderBlocks(item.children, `${key}-i${ii}`),
            ),
          ),
        );
      }
    }
  });
}

/** Render starlog-md-1 source to React nodes. Never throws on weird input. */
export function Markdown({ source }: { source: string }): ReactNode {
  try {
    const blocks = parseBlocks(source.split('\n'));
    return createElement(
      'div',
      { className: 'sl-md' },
      ...renderBlocks(blocks, 'md'),
    );
  } catch {
    // Degrade to plain text rather than breaking the view.
    return createElement('div', { className: 'sl-md' }, source);
  }
}
