import globalSetup from '../shared/global-setup.mjs';

export default async function setup() {
  return await globalSetup({
    metadata: {
      variantName: 'kafka',
      configFile: 'console.config.yaml',
      isEnterprise: false,
      needsShadowlink: false,
      needsConnect: false,
    },
  });
}
