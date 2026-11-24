import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  BadRequest_FieldViolationSchema,
  BadRequestSchema,
  ErrorInfoSchema,
  LocalizedMessageSchema,
  PreconditionFailure_ViolationSchema,
  PreconditionFailureSchema,
  QuotaFailure_ViolationSchema,
  QuotaFailureSchema,
  ResourceInfoSchema,
} from 'protogen/google/rpc/error_details_pb';
import { useClusterFenceStore } from 'stores/cluster-fence-store';

import { formatToastErrorMessageGRPC } from './toast.utils';
import { afterEach, describe, expect, test } from 'bun:test';

describe('formatToastErrorMessageGRPC', () => {
  test('basic error with no details', () => {
    const error = new ConnectError('permission denied', Code.PermissionDenied);
    const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'user' });
    expect(result).toBe('Failed to create user: permission denied');
  });

  test('error with empty rawMessage', () => {
    const error = new ConnectError('', Code.Internal);
    const result = formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'topic' });
    expect(result).toBe('Failed to delete topic');
  });

  describe('structured error details', () => {
    test('error with BadRequest field violations', () => {
      const error = new ConnectError('invalid input', Code.InvalidArgument, undefined, [
        {
          desc: BadRequestSchema,
          value: create(BadRequestSchema, {
            fieldViolations: [
              create(BadRequest_FieldViolationSchema, { field: 'username', description: 'must not be empty' }),
            ],
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'user' });
      expect(result).toBe('Failed to create user: invalid input — username: must not be empty');
    });

    test('error with multiple BadRequest field violations', () => {
      const error = new ConnectError('validation failed', Code.InvalidArgument, undefined, [
        {
          desc: BadRequestSchema,
          value: create(BadRequestSchema, {
            fieldViolations: [
              create(BadRequest_FieldViolationSchema, { field: 'username', description: 'must not be empty' }),
              create(BadRequest_FieldViolationSchema, { field: 'password', description: 'too short' }),
            ],
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'user' });
      expect(result).toBe(
        'Failed to create user: validation failed — username: must not be empty, password: too short'
      );
    });

    test('error with BadRequest field violation without field name', () => {
      const error = new ConnectError('invalid', Code.InvalidArgument, undefined, [
        {
          desc: BadRequestSchema,
          value: create(BadRequestSchema, {
            fieldViolations: [
              create(BadRequest_FieldViolationSchema, { field: '', description: 'request body is empty' }),
            ],
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'user' });
      expect(result).toBe('Failed to create user: invalid — request body is empty');
    });

    test('error with ErrorInfo', () => {
      const error = new ConnectError('access denied', Code.PermissionDenied, undefined, [
        {
          desc: ErrorInfoSchema,
          value: create(ErrorInfoSchema, {
            reason: 'INSUFFICIENT_PERMISSIONS',
            domain: 'redpanda.com',
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'user' });
      expect(result).toBe('Failed to create user: access denied (reason: INSUFFICIENT_PERMISSIONS)');
    });

    test('error with PreconditionFailure', () => {
      const error = new ConnectError('precondition failed', Code.FailedPrecondition, undefined, [
        {
          desc: PreconditionFailureSchema,
          value: create(PreconditionFailureSchema, {
            violations: [
              create(PreconditionFailure_ViolationSchema, {
                type: 'TOS',
                subject: 'google.com/cloud',
                description: 'Terms of service not accepted',
              }),
            ],
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'update', entity: 'cluster' });
      expect(result).toBe('Failed to update cluster: precondition failed — Terms of service not accepted');
    });

    test('error with QuotaFailure', () => {
      const error = new ConnectError('quota exceeded', Code.ResourceExhausted, undefined, [
        {
          desc: QuotaFailureSchema,
          value: create(QuotaFailureSchema, {
            violations: [create(QuotaFailure_ViolationSchema, { description: 'Request limit exceeded' })],
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'topic' });
      expect(result).toBe('Failed to create topic: quota exceeded — Request limit exceeded');
    });

    test('error with ResourceInfo', () => {
      const error = new ConnectError('not found', Code.NotFound, undefined, [
        {
          desc: ResourceInfoSchema,
          value: create(ResourceInfoSchema, {
            resourceType: 'topic',
            resourceName: 'my-topic',
            description: 'does not exist',
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'topic' });
      expect(result).toBe('Failed to delete topic: not found — topic "my-topic": does not exist');
    });

    test('error with LocalizedMessage uses localized text', () => {
      const error = new ConnectError('internal', Code.Internal, undefined, [
        {
          desc: LocalizedMessageSchema,
          value: create(LocalizedMessageSchema, {
            locale: 'en-US',
            message: 'A user-friendly error message',
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'user' });
      expect(result).toBe('Failed to create user: A user-friendly error message');
    });

    test('error with multiple detail types combines context', () => {
      const error = new ConnectError('invalid input', Code.InvalidArgument, undefined, [
        {
          desc: ErrorInfoSchema,
          value: create(ErrorInfoSchema, {
            reason: 'VALIDATION_ERROR',
            domain: 'redpanda.com',
          }),
        },
        {
          desc: BadRequestSchema,
          value: create(BadRequestSchema, {
            fieldViolations: [create(BadRequest_FieldViolationSchema, { field: 'name', description: 'is required' })],
          }),
        },
      ]);
      const result = formatToastErrorMessageGRPC({ error, action: 'create', entity: 'role' });
      expect(result).toBe('Failed to create role: invalid input (reason: VALIDATION_ERROR) — name: is required');
    });
  });
});

describe('formatToastErrorMessageGRPC while the cluster is fenced', () => {
  const kafkaError = (reason: string, code = Code.InvalidArgument) =>
    new ConnectError('the request was rejected', code, undefined, [
      { desc: ErrorInfoSchema, value: create(ErrorInfoSchema, { reason, domain: 'redpanda.com/kafka' }) },
    ]);

  afterEach(() => {
    useClusterFenceStore.setState({ phase: null });
  });

  test('names the fence after the broker’s own message for a policy violation', () => {
    useClusterFenceStore.setState({ phase: 'fenced' });
    expect(
      formatToastErrorMessageGRPC({ error: kafkaError('POLICY_VIOLATION'), action: 'create', entity: 'topic' })
    ).toBe(
      'Failed to create topic: the request was rejected (reason: POLICY_VIOLATION). This cluster is fenced, which rejects writes and most changes a shadow link copies until it’s unfenced.'
    );
  });

  test.each([
    [
      'a role change Admin API v2 refuses',
      new ConnectError('Operation blocked by the cluster fence', Code.FailedPrecondition),
    ],
    ['a role change Admin API v1 refuses', new ConnectError('Operation blocked by the cluster fence', Code.Unknown)],
    ['a refused shadow link', new ConnectError('The cluster is fenced', Code.Unavailable)],
  ])('names the fence for %s', (_label, error) => {
    useClusterFenceStore.setState({ phase: 'fenced' });
    expect(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'role' })).toContain(
      'This cluster is fenced, which rejects writes'
    );
  });

  test('says brokers may still be rejecting while it unfences', () => {
    useClusterFenceStore.setState({ phase: 'unfencing' });
    expect(
      formatToastErrorMessageGRPC({ error: kafkaError('POLICY_VIOLATION'), action: 'create', entity: 'topic' })
    ).toContain('being unfenced');
  });

  test.each([
    ['a timeout', 'fenced' as const, kafkaError('REQUEST_TIMED_OUT')],
    [
      'an unrelated failed precondition',
      'fenced' as const,
      new ConnectError('group not empty', Code.FailedPrecondition),
    ],
    [
      'the fence’s own error',
      'fenced' as const,
      new ConnectError('Cluster fence revision has changed', Code.FailedPrecondition),
    ],
    ['anything, while unfenced', 'unfenced' as const, kafkaError('POLICY_VIOLATION')],
  ])('doesn’t blame the fence for %s', (_label, phase, error) => {
    useClusterFenceStore.setState({ phase });
    expect(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'topic' })).not.toContain('This cluster is');
  });
});
