// Markdown plugin types: the contract for extending starlog-md.
//
// A block plugin recognizes a block-level construct (heading, list, …).
// An inline plugin recognizes an inline construct (emphasis, link, …).
// Each plugin parses its syntax into a plain-data token and renders that
// token to React nodes. Register new plugins to extend the language.

import type { ReactNode } from 'react';

/** Block-level token. Open shape: plugins define their own fields. */
export interface Block {
  t: string;
  [key: string]: unknown;
}

/** Inline-level token. Open shape: plugins define their own fields. */
export interface InlineToken {
  t: string;
  [key: string]: unknown;
}

export interface ParserContext {
  parseBlocks(lines: string[]): Block[];
  parseInline(src: string): InlineToken[];
}

export interface RenderContext extends ParserContext {
  renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[];
  renderInline(tokens: InlineToken[], keyPrefix: string): ReactNode[];
}

export interface BlockPlugin {
  /** Unique name, e.g. 'heading'. Also used to route rendering. */
  name: string;
  /**
   * Try to parse a block starting at lines[i].
   * Return { block, next } on success, null if this plugin doesn't apply.
   * `next` is the index of the first line after the block.
   */
  parse(
    lines: string[],
    i: number,
    ctx: ParserContext,
  ): { block: Block; next: number } | null;
  /** Render a block previously produced by this plugin's parse. */
  render(block: Block, key: string, ctx: RenderContext): ReactNode;
}

export interface InlinePlugin {
  /** Unique name, e.g. 'emphasis'. Also used to route rendering. */
  name: string;
  /**
   * Try to parse an inline construct starting at src[i].
   * Return { token, next } on success, null if this plugin doesn't apply.
   * `next` is the index of the first char after the construct.
   */
  parse(
    src: string,
    i: number,
    ctx: ParserContext,
  ): { token: InlineToken; next: number } | null;
  /** Render a token previously produced by this plugin's parse. */
  render(token: InlineToken, key: string, ctx: RenderContext): ReactNode;
}
