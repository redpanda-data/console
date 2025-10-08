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

import { WarningIcon } from '@chakra-ui/icons';
import { Box, Button, List, ListIcon, ListItem, Result, Section } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { FC, ReactElement } from 'react';

import ErrorResult from './error-result';
import { api } from '../../state/backend-api';
import type { WrappedApiError } from '../../state/rest-interfaces';

function isWrappedApiError(error: unknown): error is WrappedApiError {
  return error !== null && typeof error === 'object' && 'statusCode' in error;
}

export const ErrorDisplay: FC<{ children: ReactElement }> = observer(({ children }) => {
  if (api.errors.length === 0) {
    return children;
  }

  const error = api.errors[0];

  return (
    <>
      {isWrappedApiError(error) ? (
        <Box py={10}>
          <ErrorResult error={error} />
        </Box>
      ) : (
        <Result
          extra={
            <Button alignSelf="center" onClick={clearErrors}>
              Retry
            </Button>
          }
          status={500}
          title="Backend API Error"
          userMessage="Something went wrong while pulling data from the backend server"
        />
      )}

      <Section>
        <List spacing={3}>
          {api.errors.map((e, i) => (
            <ListItem display="flex" key={i}>
              <ListIcon alignSelf="center" as={WarningIcon} color="red.500" />
              {formatError(e)}
            </ListItem>
          ))}
        </List>
      </Section>
    </>
  );
});

function formatError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return String(err);
}

function clearErrors() {
  api.errors = [];
}
