// SVG sanitizer for decorations. Decorations are first-class content but
// arrive as raw text from the database, so they are scrubbed before render:
//
// - whole document must parse as XML/SVG, else rejected
// - denylisted elements removed: script, foreignObject, iframe, object,
//   embed, link, meta, style, audio, video, image, use-with-external-ref
//   (external <image> refs are tracking pixels by another name)
// - event-handler attributes (on*) removed
// - href / xlink:href kept only for same-document fragment refs (#...),
//   which gradients, masks and <use> need
// - style attributes dropped when they smuggle url()/import/javascript
//
// Returns the sanitized SVG string, or null when the input is unusable.

const DENY_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'style',
  'audio',
  'video',
  'image',
  'frameset',
  'form',
  'input',
  'button',
  'a', // links inside a doodle are out of scope; drop the element, keep kids? no — drop
]);

const DANGEROUS_STYLE_RE = /url\s*\(\s*['"]?(?!#)|@import|expression\s*\(|javascript:/i;

function cleanNode(node: Element): void {
  // walk a static copy since we mutate
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (DENY_ELEMENTS.has(tag)) {
      child.remove();
      continue;
    }
    // scrub attributes
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on')) {
        child.removeAttribute(attr.name);
        continue;
      }
      if (name === 'href' || name === 'xlink:href') {
        if (!value.startsWith('#')) child.removeAttribute(attr.name);
        continue;
      }
      if (name === 'style' && DANGEROUS_STYLE_RE.test(value)) {
        child.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === 'src' || name === 'data' || name === 'action' || name === 'formaction') &&
        !value.startsWith('#')
      ) {
        child.removeAttribute(attr.name);
        continue;
      }
    }
    cleanNode(child);
  }
}

export function sanitizeSvg(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 65536) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') return null;
  if (doc.querySelector('parsererror')) return null;

  // scrub the root element's own attributes too
  for (const attr of Array.from(root.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) root.removeAttribute(attr.name);
  }
  cleanNode(root);

  try {
    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}
