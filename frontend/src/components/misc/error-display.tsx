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

import { WarningIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import type { FC, ReactElement } from 'react';

import ErrorResult from './error-result';
import Section from './section';
import { api } from '../../state/backend-api';
import type { WrappedApiError } from '../../state/rest-interfaces';

function isWrappedApiError(error: unknown): error is WrappedApiError {
  return error !== null && typeof error === 'object' && 'statusCode' in error;
}

export const ErrorDisplay: FC<{ children: ReactElement }> = ({ children }) => {
  if (api.errors.length === 0) {
    return children;
  }

  const error = api.errors[0];

  return (
    <>
      {isWrappedApiError(error) ? (
        <div className="py-10">
          <ErrorResult error={error} />
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Backend API Error</EmptyTitle>
            <EmptyDescription>Something went wrong while pulling data from the backend server</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={clearErrors}>Retry</Button>
          </EmptyContent>
        </Empty>
      )}

      <Section>
        <ul className="flex flex-col gap-3">
          {api.errors.map((e) => (
            <li className="flex items-center gap-2" key={formatError(e)}>
              <WarningIcon className="shrink-0 text-destructive" />
              {formatError(e)}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
};

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return String(err);
}

function clearErrors() {
  api.errors = [];
}
