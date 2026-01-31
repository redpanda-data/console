// Mock for @tanstack/react-router that re-exports everything but overrides useParams
// This is needed because rstest doesn't support importOriginal pattern
// We import from the actual node_modules path to avoid circular alias resolution

// Re-export everything from the original module using direct path
export * from '../../node_modules/@tanstack/react-router/dist/esm/index.js';

// Override useParams to return the test shadow link name
export const useParams = () => ({ name: 'test-shadow-link' });
