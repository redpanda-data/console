import { toast } from 'sonner';

interface StepSubmissionResult {
  success: boolean;
  message?: string; // Success or error message
  error?: string; // Detailed error for debugging
}

export interface BaseStepRef {
  triggerSubmit: () => Promise<StepSubmissionResult>;
  isLoading: boolean;
}

/**
 * Handles step submission results with success feedback only
 * @param result - The step submission result
 * @param onSuccess - Callback to execute on successful submission (typically methods.next())
 * @returns boolean indicating if the step should proceed
 */
export const handleStepResult = (result: StepSubmissionResult | undefined, onSuccess: () => void): boolean => {
  if (result?.success) {
    // Show success toast if message provided
    if (result.message) {
      toast.success(result.message);
    }
    // Execute success callback (navigation)
    onSuccess();
    return true;
  }

  // For errors: Forms handle their own errors exclusively
  // - Field-level errors: React Hook Form handles automatically
  // - Form-level errors: Each form component displays its own contextual errors
  // - No global error handling - errors stay within their respective forms
  return false;
};

/**
 * Checks if a value is empty (null, undefined, or empty string)
 * @param value - The value to check
 * @returns true if the value is null, undefined, or empty string
 */
export const isEmpty = (value: string | null | undefined): boolean => value == null || value === '';

/**
 * Checks if a value has content (not null, undefined, or empty string)
 * @param value - The value to check
 * @returns true if the value has content
 */
export const hasValue = (value: string | null | undefined): boolean => !isEmpty(value);

export enum WizardStep {
  ADD_INPUT = 'add-input-step',
  ADD_OUTPUT = 'add-output-step',
  ADD_TOPIC = 'add-topic-step',
  ADD_USER = 'add-user-step',
}
