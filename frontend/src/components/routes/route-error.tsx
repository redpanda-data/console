/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useRouter } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';

import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';

type RouteErrorProps = {
  error: unknown;
};

// Router error boundaries can receive a rejection/throw that isn't a proper Error
// (e.g. an aborted request during navigation), so never assume `error.message` exists.
const getRouteErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'An unexpected error occurred.';
};

/**
 * Default error component for route-level errors.
 * Displayed when a route's loader throws an error.
 */
export const RouteError = ({ error }: RouteErrorProps) => {
  const router = useRouter();

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
      <img alt="Error" className="h-[140px]" src={errorBananaSlip} />
      <h2 className="font-semibold text-heading-xl">Something went wrong</h2>
      <p className="max-w-md text-center text-body text-muted-foreground">{getRouteErrorMessage(error)}</p>
      <Button onClick={() => router.invalidate()} variant="outline">
        Try again
      </Button>
    </div>
  );
};
