import '@testing-library/jest-dom/vitest';
// NOTE: not importing src/globals.css — Tailwind v4's @source directive
// interleaved with @imports in that file trips PostCSS' strict @import-first
// rule in the Vitest browser-mode pipeline. Deterministic screenshots are
// already guaranteed by the animation-kill stylesheet appended below plus
// the `reducedMotion:'reduce'` playwright context option in the config.

// Suppress the motion library's "Reduced Motion enabled" warning — we
// intentionally set reducedMotion:'reduce' in vitest.config.browser.mts.
// biome-ignore lint/suspicious/noConsole: test setup needs to patch console.warn
const _warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Reduced Motion')) {
    return;
  }
  _warn(...args);
};

// Kill CSS animations/transitions for deterministic screenshots.
// JS-driven animations (motion/framer-motion) are disabled via reducedMotion
// context option in vitest.config.browser.mts.
const style = document.createElement('style');
style.textContent = [
  '*, *::before, *::after {',
  '  animation-duration: 0s !important;',
  '  animation-delay: 0s !important;',
  '  transition-duration: 0s !important;',
  '  transition-delay: 0s !important;',
  '  scroll-behavior: auto !important;',
  '}',
].join('\n');
document.head.appendChild(style);
