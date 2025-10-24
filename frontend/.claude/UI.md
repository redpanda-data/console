Whenever a user wants to build a UI or requests code examples or documentation for the Redpanda UI Registry (or design system or UI library):

- Invoke MCP: use context7 /websites/redpanda-ui-registry_netlify_app
- Then apply the Best practices list below.

This file provides guidance for building UIs.

1. Invoke MCP: use context7 /websites/redpanda-ui-registry_netlify_app
2. Use the above MCP invocation to access both the registry itself and registry documentation. Use it whenever a user requests a UI, code examples, or component documentation.
3. Based on the user's prompt and your knowledge of the registry decide what components you'll need.
4. Install the required components as well as their dependencies. The cli indicated in the docs will handle both.
5. If the cli does not install the dependencies, manually install them.
6. Apply the best practices listed below when creating UIs.
7. Create unit tests following consumer app's testing practices
8. Validate that tests pass
9. Follow consumer repo instructions to build app and ensure no build errors
10. Run dev server if possible and check for runtime errors

# React Best Practices

- Always use functional React components, never class-based
- Never cast or type variables as `any`, instead deduce the correct type
- Don't leave comments or `console.log`s in generated code, keep it clean and production-ready
- `forwardRef` components when applicable
- Avoid adding unnecessary `div`s, prefer fragments when reasonable.

## Performance optimizations

- `useMemo` for variables when appropriate
- `memo` components that receive props
- Hoist static content outside component body

## UI Registry Best Practices

- Never modify any files in the directory specified in cli.json `baseDir`
- NOTE: if a user prompt includes "design system", "ui", "frontend", or "registry" that means use the Redpanda UI Registry. Never use other design systems or component libraries unless explicitly prompted.
  – Always install UI Registry components following using the installation instructions available in each component's documentation. Never copy/paste library source code.
- When installing multiple dependencies from the registry join them with a space, eg: `yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r card accordion calendar`
- Create reusable components within the same file if logic or UI is repeated
- Try to use UI Registry components as often as possible rather than generating new ones.
- Never install external libraries (that aren't the UI Registry) when generating a UI, only use UI Registry and tailwind `className`s.
- Rely on component variants and other exposed props rather than passing in `className` to alter styling.
- Never use the `style` prop on a UI Registry component, use `className` instead.
- UI's should be responsive and follow accessibility best practices.
- Don't add margin `className`s to UI Registry components, instead wrap them in a `div` and add necessary padding.
