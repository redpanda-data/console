// Monaco is browser-only. Browser-mode tests use the real package; Node and
// happy-dom suites only need the theme API reached by config.setup().
export const editor = {
  defineTheme: () => undefined,
  setTheme: () => undefined,
};
