export const DEFAULT_TABLE_PAGE_SIZE = 50;
export const DEFAULT_API_BASE = './api' as const;

// Builder.io API Key (public key for OSS)
export const BUILDER_API_KEY = '4abd0efa0759420b88149ada5c1eb216';

// By default, most feature flags will be false when there's no embedded mode on.
export const FEATURE_FLAGS = {
  enableAiAgentsInConsoleUi: false,
  enableAiAgentsInConsoleUiPreview: false,
  enableKnowledgeBaseInConsoleUi: false,
  enableRemoteMcpInConsole: false,
  enableRemoteMcpInspectorInConsole: false,
  enableRemoteMcpConnectClientInConsoleServerless: false,
};
