# UI.md

When user requests UI, code examples, or Redpanda UI Registry documentation:

1. **Invoke MCP**: `use context7 /websites/redpanda-ui-registry_netlify_app`
2. **Identify components** needed based on user prompt and registry knowledge
3. **Install components** via CLI (handles dependencies): `yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r <components>`
4. **Apply best practices** below
5. **Test**: Create tests, validate they pass, ensure no build errors
6. **Verify**: Run dev server and check for runtime errors

## React Best Practices
- Functional components only (no classes)
- Never use `any` - deduce correct types
- No `console.log` or comments in generated code
- `forwardRef` when applicable
- Prefer fragments over unnecessary `div`s
- `useMemo` for expensive computations
- `memo` for components receiving props
- Hoist static content outside component body

## UI Registry Best Practices
- **Never modify** files in `baseDir` (specified in cli.json)
- **Keywords**: "design system", "ui", "frontend", "registry" → use Redpanda UI Registry
- **Install via CLI** - never copy/paste source code
- **Multiple components**: Join with space: `yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r card accordion calendar`
- **Reuse**: Create reusable components in same file if logic/UI repeats
- **No external libraries** for UI - use registry + Tailwind only
- **Use component variants** and exposed props (not `className` for styling)
- **Never use `style` prop** - use `className` instead
- **Responsive & accessible** by default
- **No margin on registry components** - wrap in `div` with padding instead
