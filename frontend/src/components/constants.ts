export const DEFAULT_TABLE_PAGE_SIZE = 50;
export const DEFAULT_API_BASE = './api' as const;

// By default, most feature flags will be false when there's no embedded mode on.
export const FEATURE_FLAGS = {
  enableAiAgentsInConsoleUi: false,
  enableAiAgentsInConsoleUiPreview: false,
  enableKnowledgeBaseInConsoleUi: false,
};
