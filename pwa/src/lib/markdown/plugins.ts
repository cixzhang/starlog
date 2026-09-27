// Built-in starlog-md-1 plugins.
//
// Supported: ATX headings (#-###), paragraphs, hard breaks (two trailing
// spaces), fenced code blocks (``` with optional info string), single-level
// blockquotes, nested unordered/ordered lists, thematic breaks, inline
// emphasis (* ** _ __), inline code, https:// links and <https://> autolinks.
//
// Safety: plugins render to React nodes, so all text is escaped by
// construction. Raw HTML is never interpreted. External images `![](...)`
// render as literal text. Links allow https:// only; anything else renders
// literally. Excluded constructs (tables, strikethrough, task lists,
// footnotes, setext headings, indented code, reference links) get no special
// handling and render as plain text.
//
// Plugin order matters: more specific block plugins run before the
// paragraph fallback; more specific inline plugins run before plain text.

import { createElement } from 'react';
import type {
  Block,
  BlockPlugin,
  InlinePlugin,
  InlineToken,
  ParserContext,
} from './types';

// ---------- shared regexes ----------

const BLANK_RE = /^\s*$/;
const HR_RE = /^\s{0,3}(---|\*\*\*|___)\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^\s{0,3}```(.*)$/;
const FENCE_CLOSE_RE = /^\s{0,3}```\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const HTTPS_RE = /^https:\/\/[^\s<>"')\]]+/;

function isHttpsUrl(u: string): boolean {
  return /^https:\/\/[^\s<>"']+$/.test(u);
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

// ---------- block plugins ----------

const fencedCodePlugin: BlockPlugin = {
  name: 'code',
  parse(lines, i) {
    const fence = FENCE_RE.exec(lines[i]);
    if (!fence) return null;
    const info = fence[1].trim();
    const buf: string[] = [];
    let j = i + 1;
    while (j < lines.length && !FENCE_CLOSE_RE.test(lines[j])) {
      buf.push(lines[j]);
      j++;
    }
    j++; // consume closing fence (or EOF)
    return { block: { t: 'code', info, text: buf.join('\n') }, next: j };
  },
  render(block, key) {
    const info = block.info as string;
    return createElement(
      'pre',
      { key },
      createElement(
        'code',
        { 'data-info': info || undefined },
        block.text as string,
      ),
    );
  },
};

const thematicBreakPlugin: BlockPlugin = {
  name: 'hr',
  parse(lines, i) {
    if (!HR_RE.test(lines[i])) return null;
    return { block: { t: 'hr' }, next: i + 1 };
  },
  render(_block, key) {
    return createElement('hr', { key });
  },
};

const headingPlugin: BlockPlugin = {
  name: 'heading',
  parse(lines, i) {
    const h = HEADING_RE.exec(lines[i]);
    if (!h) return null;
    return {
      block: { t: 'heading', level: h[1].length, text: h[2] },
      next: i + 1,
    };
  },
  render(block, key, ctx) {
    const level = Math.min(3, Math.max(1, block.level as number)) as 1 | 2 | 3;
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
    return createElement(
      Tag,
      { key },
      ...ctx.renderInline(ctx.parseInline(block.text as string), key),
    );
  },
};

const blockquotePlugin: BlockPlugin = {
  name: 'quote',
  parse(lines, i, ctx) {
    if (!QUOTE_RE.test(lines[i])) return null;
    const buf: string[] = [];
    let j = i;
    while (j < lines.length) {
      const q = QUOTE_RE.exec(lines[j]);
      if (!q) break;
      buf.push(q[1]);
      j++;
    }
    // single-level: inner content parsed as blocks, quotes inside stay text
    const inner = ctx.parseBlocks(
      buf.map((l) => (l.startsWith('>') ? l.slice(1) : l)),
    );
    return { block: { t: 'quote', inner }, next: j };
  },
  render(block, key, ctx) {
    return createElement(
      'blockquote',
      { key },
      ...ctx.renderBlocks(block.inner as Block[], key),
    );
  },
};

interface ListItemData {
  lines: string[];
  children: Block[];
}

const listPlugin: BlockPlugin = {
  name: 'list',
  parse(lines, i, ctx) {
    const lm = LIST_RE.exec(lines[i]);
    if (!lm) return null;
    const { block, next } = parseList(lines, i, lm[1].length, ctx);
    return { block, next };
  },
  render(block, key, ctx) {
    const Tag = block.ordered ? 'ol' : 'ul';
    const items = block.items as ListItemData[];
    return createElement(
      Tag,
      { key },
      ...items.map((item, ii) => {
        const itemKey = `${key}-i${ii}`;
        return createElement(
          'li',
          { key: itemKey },
          ...ctx.renderInline(ctx.parseInline(item.lines.join(' ')), itemKey),
          ...ctx.renderBlocks(item.children, itemKey),
        );
      }),
    );
  },
};

function parseList(
  lines: string[],
  start: number,
  baseIndent: number,
  ctx: ParserContext,
): { block: Block; next: number } {
  const items: ListItemData[] = [];
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
      const { block } = parseList(dedented, 0, 0, ctx);
      children.push(block);
    }
    items.push({ lines: itemLines, children });
  }

  return { block: { t: 'list', ordered: ordered ?? false, items }, next: i };
}

/**
 * Paragraph fallback: consumes consecutive lines that no earlier plugin
 * claimed. Must stay last in the block plugin list.
 */
const paragraphPlugin: BlockPlugin = {
  name: 'para',
  parse(lines, i) {
    if (BLANK_RE.test(lines[i])) return null;
    const buf: string[] = [];
    let j = i;
    // Claim lines until blank or a line another plugin would claim.
    // We re-test the specific (non-paragraph) matchers here.
    while (
      j < lines.length &&
      !BLANK_RE.test(lines[j]) &&
      !FENCE_RE.test(lines[j]) &&
      !HR_RE.test(lines[j]) &&
      !HEADING_RE.test(lines[j]) &&
      !QUOTE_RE.test(lines[j]) &&
      !LIST_RE.test(lines[j])
    ) {
      buf.push(lines[j]);
      j++;
    }
    if (buf.length === 0) return null;
    return { block: { t: 'para', lines: buf }, next: j };
  },
  render(block, key, ctx) {
    const lines = block.lines as string[];
    const out: ReturnType<typeof ctx.renderInline> = [];
    lines.forEach((ln, li) => {
      const hardBreak = / {2,}$/.test(ln);
      const text = hardBreak ? ln.replace(/ {2,}$/, '') : ln;
      if (li > 0) out.push(' ');
      out.push(...ctx.renderInline(ctx.parseInline(text), `${key}-l${li}`));
      if (hardBreak) out.push(createElement('br', { key: `${key}-br${li}` }));
    });
    return createElement('p', { key }, ...out);
  },
};

export const blockPlugins: BlockPlugin[] = [
  fencedCodePlugin,
  thematicBreakPlugin,
  headingPlugin,
  blockquotePlugin,
  listPlugin,
  paragraphPlugin, // fallback; keep last
];

// ---------- inline plugins ----------

const codeSpanPlugin: InlinePlugin = {
  name: 'code',
  parse(src, i) {
    if (src[i] !== '`') return null;
    let n = 1;
    while (src[i + n] === '`') n++;
    const close = src.indexOf('`'.repeat(n), i + n);
    if (close === -1) return null;
    return {
      token: { t: 'code', s: src.slice(i + n, close) },
      next: close + n,
    };
  },
  render(token, key) {
    return createElement('code', { key }, token.s as string);
  },
};

const autolinkPlugin: InlinePlugin = {
  name: 'autolink',
  parse(src, i) {
    if (src[i] !== '<') return null;
    const m = HTTPS_RE.exec(src.slice(i + 1));
    if (!m || src[i + 1 + m[0].length] !== '>') return null;
    const href = m[0];
    return {
      token: { t: 'link', href, children: [{ t: 'text', s: href }] },
      next: i + 1 + m[0].length + 1,
    };
  },
  render(token, key, ctx) {
    return createElement(
      'a',
      {
        key,
        href: token.href as string,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      ...ctx.renderInline(token.children as InlineToken[], key),
    );
  },
};

/** Images render as literal text: no external media, ever. */
const imageLiteralPlugin: InlinePlugin = {
  name: 'image',
  parse(src, i) {
    if (src[i] !== '!' || src[i + 1] !== '[') return null;
    const end = matchBracketPair(src, i + 1);
    if (end === -1) return null;
    return {
      token: { t: 'image', s: src.slice(i, end + 1) },
      next: end + 1,
    };
  },
  render(token, key) {
    return createElement('span', { key }, token.s as string);
  },
};

const linkPlugin: InlinePlugin = {
  name: 'link',
  parse(src, i, ctx) {
    if (src[i] !== '[') return null;
    const end = matchBracketPair(src, i);
    if (end === -1 || src[end + 1] !== '(') return null;
    const closeParen = src.indexOf(')', end + 2);
    if (closeParen === -1) return null;
    const rawUrl = src.slice(end + 2, closeParen).trim();
    const url = rawUrl.replace(/^<|>$/g, '');
    const inner = src.slice(i + 1, end);
    const next = closeParen + 1;
    if (isHttpsUrl(url)) {
      return {
        token: { t: 'link', href: url, children: ctx.parseInline(inner) },
        next,
      };
    }
    // Non-https links render literally.
    return {
      token: { t: 'text', s: src.slice(i, closeParen + 1) },
      next,
    };
  },
  render(token, key, ctx) {
    return createElement(
      'a',
      {
        key,
        href: token.href as string,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      ...ctx.renderInline(token.children as InlineToken[], key),
    );
  },
};

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}_]/u.test(c);
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

const emphasisPlugin: InlinePlugin = {
  name: 'emphasis',
  parse(src, i, ctx) {
    const c = src[i];
    if (c !== '*' && c !== '_') return null;
    const double = src[i + 1] === c;
    const marker = double ? c + c : c;
    // intra-word _ does not open/close emphasis (CommonMark-ish)
    const prev = src[i - 1];
    const nextCh = src[i + marker.length];
    if (c === '_' && !double && isWordChar(prev) && isWordChar(nextCh)) {
      return null;
    }
    const k = findCloser(src, i, marker);
    if (k === -1) return null;
    return {
      token: {
        t: double ? 'strong' : 'em',
        children: ctx.parseInline(src.slice(i + marker.length, k)),
      },
      next: k + marker.length,
    };
  },
  render(token, key, ctx) {
    const Tag = token.t === 'strong' ? 'strong' : 'em';
    return createElement(
      Tag,
      { key },
      ...ctx.renderInline(token.children as InlineToken[], key),
    );
  },
};

export const inlinePlugins: InlinePlugin[] = [
  codeSpanPlugin,
  autolinkPlugin,
  imageLiteralPlugin,
  linkPlugin,
  emphasisPlugin,
];
