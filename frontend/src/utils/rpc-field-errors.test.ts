import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { BadRequestSchema } from 'protogen/google/rpc/error_details_pb';

import { getRpcFieldErrors } from './rpc-field-errors';
import { describe, expect, test } from 'bun:test';

describe('rpc field validation', () => {
  test('decodes wire validation details and retains the last description per field', () => {
    const error = new ConnectError('Invalid request', Code.InvalidArgument, undefined, [
      {
        desc: BadRequestSchema,
        value: create(BadRequestSchema, {
          fieldViolations: [
            { field: 'scram.username', description: 'Required' },
            { field: 'email', description: 'Invalid email' },
            { field: 'scram.username', description: 'Unknown user' },
          ],
        }),
      },
    ]);
    expect(getRpcFieldErrors(error)).toStrictEqual({ 'scram.username': 'Unknown user', email: 'Invalid email' });
  });

  test('does not invent field errors when details are absent', () => {
    expect(getRpcFieldErrors(new ConnectError('Unavailable', Code.Unavailable))).toStrictEqual({});
  });
});
