export const DataTypes = ['source', 'sink'] as const;
export type DataType = (typeof DataTypes)[number];

export enum WizardStep {
  ADD_DATA = 'add-data-step',
  ADD_TOPIC = 'add-topic-step',
  ADD_USER = 'add-user-step',
  CONNECT = 'connect-step',
}

// Common result type for step submissions
export interface StepSubmissionResult {
  success: boolean;
  message?: string; // Success or error message
  error?: string; // Detailed error for debugging
}

// Base interface for all step refs
export interface BaseStepRef {
  triggerSubmit: () => Promise<StepSubmissionResult>;
  isLoading: boolean;
}

// Helper to convert enum to step definitions
export const getStepDefinitions = (dataType: DataType) => [
  { id: WizardStep.ADD_DATA, title: `${dataType === 'source' ? 'Source' : 'Sink'} Your Data` },
  { id: WizardStep.ADD_TOPIC, title: 'Add a Topic' },
  { id: WizardStep.ADD_USER, title: 'Add a User' },
  { id: WizardStep.CONNECT, title: 'Connect Your Data' },
];
