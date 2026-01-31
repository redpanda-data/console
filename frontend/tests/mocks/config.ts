// Mock for config module
// Provides minimal mock implementation for testing

export const config = {
  featureFlags: {},
  jwt: null,
  clusterId: '',
  clusterName: '',
  serverVersion: '',
  gitRef: '',
  gitSha: '',
  isBusinessPlatform: false,
  isServerless: false,
  serverBuild: null,
};

export function isFeatureFlagEnabled(_featureFlag: string) {
  return false;
}

export function isEmbedded() {
  return false;
}

export function isServerless() {
  return false;
}

export const getGrpcBasePath = (overrideUrl?: string) => overrideUrl ?? '';
export const getControlplaneBasePath = (overrideUrl?: string) => overrideUrl ?? '';

export const addBearerTokenInterceptor = (next: any) => async (request: any) => next(request);

export const checkExpiredLicenseInterceptor = (next: any) => async (request: any) => next(request);

export const setMonacoTheme = () => {};

export const embeddedAvailableRoutesObservable = {
  value: [],
};

export const setup = () => {};
