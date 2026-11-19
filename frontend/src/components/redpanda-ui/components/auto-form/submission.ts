// Copyright 2026 Redpanda Data, Inc.

import { createContext, type SubmitEventHandler, useContext, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { PROTO_FORM_ROOT_ERROR_KEY } from '../../lib/protobuf-provider';
import type { SchemaValidation } from './core-types';
import { applyValidationErrors } from './helpers';
import type { AutoFormProps, ResolvedSchema } from './types';

export const AutoFormSubmissionContext = createContext(false);

/** Pending native submission state for custom AutoForm controls; false outside a form. */
export function useAutoFormSubmitting(): boolean {
  return useContext(AutoFormSubmissionContext);
}

/** Own the resolver/provider submission protocols and surface failures through RHF. */
export function useAutoFormSubmit<T extends Record<string, unknown>>(
  methods: UseFormReturn<Record<string, unknown>, unknown, T>,
  resolvedSchema: ResolvedSchema<T>,
  onSubmit: NonNullable<AutoFormProps<T>['onSubmit']>
): { handleSubmit: SubmitEventHandler<HTMLFormElement>; isSubmitting: boolean } {
  const inFlight = useRef(false);
  // RHF may leave isSubmitting true when a resolver throws; release our UI state with the lock.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const validateWithProvider = async (submittedValues: Record<string, unknown>): Promise<SchemaValidation<T>> => {
    try {
      return await Promise.resolve(resolvedSchema.provider.validateSchema(submittedValues));
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            path: [],
            message: error instanceof Error ? error.message : 'Failed to validate form values.',
          },
        ],
      };
    }
  };

  const handleValidSubmit = async (submittedValues: T) => {
    methods.clearErrors(['root', PROTO_FORM_ROOT_ERROR_KEY]);
    try {
      await onSubmit(submittedValues, methods);
    } catch (error) {
      methods.setError('root', {
        type: 'submit',
        message: error instanceof Error ? error.message : 'Submission failed.',
      });
    }
  };

  const handleProviderSubmit = async (submittedValues: Record<string, unknown>) => {
    const validationResult = await validateWithProvider(submittedValues);
    if (validationResult.success) {
      try {
        await onSubmit(validationResult.data, methods);
      } catch (error) {
        methods.setError('root', {
          type: 'submit',
          message: error instanceof Error ? error.message : 'Submission failed.',
        });
      }
      return;
    }
    applyValidationErrors(methods, validationResult.errors);
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    // Acquire before RHF starts async validation, including before its next render.
    inFlight.current = true;
    setIsSubmitting(true);
    methods
      .handleSubmit(resolvedSchema.resolver === undefined ? handleProviderSubmit : handleValidSubmit)(event)
      .catch((error: unknown) => {
        methods.setError('root', {
          type: 'submit',
          message: error instanceof Error ? error.message : 'Submission failed.',
        });
      })
      .finally(() => {
        inFlight.current = false;
        setIsSubmitting(false);
      });
  };
  return { handleSubmit, isSubmitting };
}
