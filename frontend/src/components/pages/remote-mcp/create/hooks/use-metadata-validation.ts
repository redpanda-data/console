/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { FormValues } from '../schemas';

export function useMetadataValidation(form: UseFormReturn<FormValues>) {
  const formValues = form.watch();

  const isMetadataComplete = useMemo(() => {
    // Check displayName (required)
    if (!formValues.displayName?.trim()) return false;

    // Check resourcesTier (required)
    if (!formValues.resourcesTier?.trim()) return false;

    // Check for any validation errors in metadata fields
    const hasMetadataErrors = !!(
      form.formState.errors.displayName ||
      form.formState.errors.description ||
      form.formState.errors.resourcesTier ||
      form.formState.errors.tags
    );

    return !hasMetadataErrors;
  }, [
    formValues.displayName,
    formValues.resourcesTier,
    form.formState.errors.displayName,
    form.formState.errors.description,
    form.formState.errors.resourcesTier,
    form.formState.errors.tags,
  ]);

  return { isMetadataComplete, isMetadataInvalid: !isMetadataComplete };
}
