// Stub for sonner in Node unit tests
// sonner inserts CSS at module init time which requires DOM APIs
export const toast = Object.assign(() => {}, {
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
  loading: () => {},
  dismiss: () => {},
});
export default toast;
