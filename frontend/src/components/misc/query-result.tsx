/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { ReactNode } from 'react';
import { DefaultSkeleton } from 'utils/tsx-utils';

import { Alert, AlertDescription, AlertTitle } from '../redpanda-ui/components/alert';

type Props = {
  isLoading: boolean;
  isError: boolean;
  error?: { message?: string } | null;
  errorTitle?: string;
  children: ReactNode;
  skeleton?: ReactNode;
};

export const QueryResult = ({
  isLoading,
  isError,
  error,
  errorTitle = 'Failed to load data',
  children,
  skeleton = DefaultSkeleton,
}: Props) => {
  if (isLoading) {
    return skeleton;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{errorTitle}</AlertTitle>
        <AlertDescription>{error?.message ?? 'An unexpected error occurred.'}</AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
};
