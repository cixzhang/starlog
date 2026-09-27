// Custom ESLint rule: forbid hardcoded colors, enforce Astryx tokens.
// Hardcoded colors (hex, rgb, rgba, hsl) must be replaced with
// var(--token) references. Token definitions are exempt.

const COLOR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/,           // hex colors
  /\brgba?\s*\([^)]+\)/,           // rgb() / rgba()
  /\bhsla?\s*\([^)]+\)/,           // hsl() / hsla()
];

export default {
  rules: {
    'no-hardcoded-colors': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow hardcoded colors; use Astryx design tokens (var(--*)) instead',
        },
        schema: [],
      },
      create(context) {
        // Exempt token definition files
        const filename = context.filename || '';
        if (filename.includes('theme') || filename.includes('tokens')) {
          return {};
        }

        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            // Skip if it's a var() reference (that's the correct pattern)
            if (node.value.includes('var(--')) return;
            
            for (const pattern of COLOR_PATTERNS) {
              if (pattern.test(node.value)) {
                context.report({
                  node,
                  message: 'Hardcoded color "{{value}}" found. Use an Astryx design token (var(--*)) instead.',
                  data: { value: node.value.match(pattern)[0] },
                });
                break;
              }
            }
          },
          TemplateLiteral(node) {
            // Check template literals for hardcoded colors
            for (const quasi of node.quasis) {
              const text = quasi.value.raw;
              if (text.includes('var(--')) continue;
              for (const pattern of COLOR_PATTERNS) {
                if (pattern.test(text)) {
                  context.report({
                    node,
                    message: 'Hardcoded color in template literal. Use an Astryx design token (var(--*)) instead.',
                  });
                  break;
                }
              }
            }
          },
        };
      },
    },
  },
};
