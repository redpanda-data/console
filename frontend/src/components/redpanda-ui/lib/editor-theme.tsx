/**
 * An editor theme built from the design tokens. Monaco's `defineTheme` wants `#rrggbb` and cannot read a
 * custom property, so the tokens are resolved by painting: a probe takes `color: var(--color-X)` and the
 * browser hands back an `rgb()` triple. A snapshot, not a binding — call it again when the theme flips.
 */

/** The tokens an editor needs, and which theme token each reads. */
const EDITOR_TOKENS = {
  background: '--color-background',
  foreground: '--color-foreground',
  comment: '--color-subtle',
  gutter: '--color-surface-subtle',
  gutterForeground: '--color-subtle',
  lineHighlight: '--color-accent',
  /**
   * The wash, not `selection`: Monaco paints the selection behind text it keeps syntax-coloured and
   * never applies a selection foreground, so an opaque ground lands under ink it cannot move.
   */
  selection: '--color-selected-wash',
  cursor: '--color-foreground',
  border: '--color-border',
  /** Syntax roles. The theme declares one pair per role, tuned for both grounds. */
  literal: '--color-syntax-literal',
  keyword: '--color-syntax-keyword',
  string: '--color-syntax-string',
  operator: '--color-syntax-operator',
  invalid: '--color-destructive',
} as const;

export type EditorTokenName = keyof typeof EDITOR_TOKENS;

const HEX_CHANNEL = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
const RGB_PARTS = /-?[\d.]+/g;

/** `rgb(24, 24, 24)` / `rgba(24, 24, 24, 0.3)` → `#181818` / `#1818184d`. */
const toHex = (painted: string): string => {
  const parts = (painted.match(RGB_PARTS) ?? []).map(Number);
  if (parts.length < 3) {
    return '#000000';
  }
  const alpha = parts.length > 3 && parts[3] < 1 ? HEX_CHANNEL(parts[3] * 255) : '';
  return `#${HEX_CHANNEL(parts[0])}${HEX_CHANNEL(parts[1])}${HEX_CHANNEL(parts[2])}${alpha}`;
};

/** One probe for every token, appended to `container` so it inherits the theme. */
export function resolveEditorTokens(container: HTMLElement = document.body): Record<EditorTokenName, string> {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  container.append(probe);

  const resolved = {} as Record<EditorTokenName, string>;
  for (const [name, token] of Object.entries(EDITOR_TOKENS) as [EditorTokenName, string][]) {
    probe.style.color = `var(${token})`;
    resolved[name] = toHex(getComputedStyle(probe).color);
  }

  probe.remove();
  return resolved;
}

export type EditorThemeOptions = {
  /**
   * Leave the background unpainted so the editor sits on whatever ground it is placed on. The
   * gutter follows, since a painted gutter on a transparent editor reads as a seam.
   */
  transparentBackground?: boolean;
  /** Where to read the tokens from, when the editor is not inside `document.body`. */
  container?: HTMLElement;
};

/** Monaco's `defineTheme` shape, described structurally so this carries no Monaco import. */
export type EditorTheme = {
  base: 'vs' | 'vs-dark';
  inherit: boolean;
  colors: Record<string, string>;
  rules: { token: string; foreground?: string; fontStyle?: string }[];
};

/**
 * `base` follows the resolved background rather than a prop, so a caller cannot pair a light base
 * with a dark ground. `inherit: false` keeps Monaco's defaults out entirely.
 */
export function editorTheme({ transparentBackground = false, container }: EditorThemeOptions = {}): EditorTheme {
  const token = resolveEditorTokens(container);
  const isDark = isDarkGround(token.background);

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: false,
    colors: {
      'editor.background': transparentBackground ? '#00000000' : token.background,
      'editor.foreground': token.foreground,
      'editorGutter.background': transparentBackground ? '#00000000' : token.gutter,
      'editorLineNumber.foreground': token.gutterForeground,
      'editorLineNumber.activeForeground': token.foreground,
      'editor.lineHighlightBackground': token.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': token.selection,
      'editorCursor.foreground': token.cursor,
      'editorIndentGuide.background1': token.border,
      'editorWhitespace.foreground': token.border,
    },
    // Monaco wants tokens without the leading `#`.
    rules: [
      { token: '', foreground: bare(token.foreground) },
      { token: 'comment', foreground: bare(token.comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: bare(token.keyword) },
      { token: 'type', foreground: bare(token.keyword) },
      { token: 'string', foreground: bare(token.string) },
      { token: 'string.yaml', foreground: bare(token.string) },
      { token: 'number', foreground: bare(token.literal) },
      { token: 'constant', foreground: bare(token.literal) },
      // A YAML mapping key is `type.yaml` in Monaco's grammar; give it the role a JSON
      // property name gets, so the two editors read the same.
      { token: 'type.yaml', foreground: bare(token.literal) },
      { token: 'delimiter', foreground: bare(token.operator) },
      { token: 'operator', foreground: bare(token.operator) },
      { token: 'tag', foreground: bare(token.keyword) },
      { token: 'invalid', foreground: bare(token.invalid) },
    ],
  };
}

const bare = (hex: string) => hex.replace('#', '').slice(0, 6);

/** Whether the resolved ground is dark, by relative luminance. */
function isDarkGround(hex: string): boolean {
  const parts = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) || 0);
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.040_45 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2]) < 0.4;
}
