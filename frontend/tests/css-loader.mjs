/**
 * Node.js ESM loader to handle CSS imports during testing
 * This loader intercepts CSS file imports and returns empty modules
 */

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css') || url.endsWith('.scss') || url.endsWith('.sass') || url.endsWith('.less')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default {};',
    };
  }

  return await nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  return await nextResolve(specifier, context);
}
