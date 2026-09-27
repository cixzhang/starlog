// starlog-md plugin engine.
//
// The core loop knows nothing about specific syntax: block plugins are
// tried in order until one claims the lines at hand, inline plugins are
// tried in order at each character, and rendering routes each token back
// to the plugin that produced it (matched by token `t` to plugin `name`).
// Extend the language by registering plugins; the built-ins live in
// ./plugins.ts.

import { createElement, type ReactNode } from 'react';
import { blockPlugins, inlinePlugins } from './plugins';
import type {
  Block,
  BlockPlugin,
  InlinePlugin,
  InlineToken,
  ParserContext,
  RenderContext,
} from './types';

export type { Block, BlockPlugin, InlinePlugin, InlineToken } from './types';

const blockRegistry: BlockPlugin[] = [...blockPlugins];
const inlineRegistry: InlinePlugin[] = [...inlinePlugins];

/**
 * Register a block plugin. Inserted before the paragraph fallback so it
 * can claim syntax; the fallback always stays last.
 */
export function registerBlockPlugin(plugin: BlockPlugin): void {
  const fallback = blockRegistry.pop()!;
  blockRegistry.push(plugin, fallback);
}

/** Register an inline plugin; tried before plain-text consumption. */
export function registerInlinePlugin(plugin: InlinePlugin): void {
  inlineRegistry.push(plugin);
}

const BLANK_RE = /^\s*$/;

function makeParserContext(): ParserContext {
  return {
    parseBlocks: (lines) => parseBlocks(lines),
    parseInline: (src) => parseInline(src),
  };
}

function parseBlocks(lines: string[]): Block[] {
  const ctx = makeParserContext();
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (BLANK_RE.test(lines[i])) {
      i++;
      continue;
    }
    let claimed = false;
    for (const plugin of blockRegistry) {
      const result = plugin.parse(lines, i, ctx);
      if (result) {
        blocks.push(result.block);
        i = result.next;
        claimed = true;
        break;
      }
    }
    // The paragraph fallback always claims non-blank lines; this is a
    // safety net so a misbehaving plugin can't hang the parser.
    if (!claimed) i++;
  }
  return blocks;
}

function parseInline(src: string): InlineToken[] {
  const ctx = makeParserContext();
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
    let claimed = false;
    for (const plugin of inlineRegistry) {
      const result = plugin.parse(src, i, ctx);
      if (result) {
        flush();
        out.push(result.token);
        i = result.next;
        claimed = true;
        break;
      }
    }
    if (!claimed) {
      buf += src[i];
      i++;
    }
  }
  flush();
  return out;
}

function makeRenderContext(): RenderContext {
  const parser = makeParserContext();
  return {
    ...parser,
    renderBlocks: (blocks, keyPrefix) => renderBlocks(blocks, keyPrefix),
    renderInline: (tokens, keyPrefix) => renderInline(tokens, keyPrefix),
  };
}

function findBlockPlugin(t: string): BlockPlugin | undefined {
  return blockRegistry.find((p) => p.name === t);
}

function findInlinePlugin(t: string): InlinePlugin | undefined {
  return inlineRegistry.find((p) => p.name === t);
}

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  const ctx = makeRenderContext();
  return blocks.map((b, bi) => {
    const key = `${keyPrefix}-b${bi}`;
    const plugin = findBlockPlugin(b.t);
    if (!plugin) return null;
    return plugin.render(b, key, ctx);
  });
}

function renderInline(tokens: InlineToken[], keyPrefix: string): ReactNode[] {
  const ctx = makeRenderContext();
  return tokens.map((tok, i) => {
    const key = `${keyPrefix}-${i}`;
    // Plain text is produced by the engine itself, not a plugin.
    if (tok.t === 'text') return tok.s as string;
    if (tok.t === 'br') return createElement('br', { key });
    const plugin = findInlinePlugin(tok.t);
    if (!plugin) return tok.s as string;
    return plugin.render(tok, key, ctx);
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
