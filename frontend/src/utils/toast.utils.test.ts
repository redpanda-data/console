import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { rs } from '@rstest/core';
import { toast } from 'components/redpanda-ui/components/toast';
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

import { closeToast, formatToastErrorMessageGRPC, showToast, updateToast } from './toast.utils';

// Spies on the real manager: the unit project shares module caches across files, so a module mock
// only takes effect when this file happens to load `toast.utils` first.
const add = rs.spyOn(toast, 'add').mockImplementation(() => 'toast-1');
const update = rs.spyOn(toast, 'update').mockImplementation(() => undefined);
const close = rs.spyOn(toast, 'close').mockImplementation(() => undefined);

afterAll(() => {
  rs.restoreAllMocks();
});

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
    expect(result).toBe('Failed to create user: validation failed — username: must not be empty, password: too short');
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

describe('showToast', () => {
  beforeEach(() => {
    add.mockClear();
  });

  test('non-error toasts auto-dismiss after 5s', () => {
    const id = showToast({ status: 'success', title: 'Saved' });
    expect(id).toBe('toast-1');
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Saved', timeout: 5000 }));
  });

  test('error toasts stay until closed', () => {
    showToast({ status: 'error', title: 'Failed' });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', timeout: 0 }));
  });

  test('duration null is sticky, an explicit duration is kept', () => {
    showToast({ status: 'info', duration: null });
    showToast({ status: 'info', duration: 2500 });
    expect(add.mock.calls[0][0]).toMatchObject({ timeout: 0 });
    expect(add.mock.calls[1][0]).toMatchObject({ timeout: 2500 });
  });

  test('resourceName scopes the id, or stands in for it', () => {
    showToast({ id: 'secret-update', resourceName: 'db-password', status: 'success' });
    showToast({ id: 'secret-update', status: 'success' });
    showToast({ resourceName: 'db-password', status: 'success' });
    showToast({ status: 'success' });
    const ids = add.mock.calls.map(([options]) => options.id);
    expect(ids).toEqual(['secret-update_db-password', 'secret-update', 'db-password', undefined]);
  });
});

describe('updateToast', () => {
  beforeEach(() => {
    update.mockClear();
  });

  test('passes only the fields given', () => {
    updateToast('toast-1', { description: 'Setting throttle rate... done' });
    expect(update).toHaveBeenCalledWith('toast-1', { description: 'Setting throttle rate... done' });
  });

  test('a new status re-applies its dismiss default', () => {
    updateToast('toast-1', { status: 'error', description: 'Setting throttle rate... error' });
    expect(update).toHaveBeenCalledWith('toast-1', {
      type: 'error',
      timeout: 0,
      description: 'Setting throttle rate... error',
    });
    updateToast('toast-1', { status: 'success' });
    expect(update).toHaveBeenLastCalledWith('toast-1', { type: 'success', timeout: 5000 });
  });

  test('an explicit duration wins over the status default', () => {
    updateToast('toast-1', { status: 'error', duration: 2500 });
    expect(update).toHaveBeenCalledWith('toast-1', { type: 'error', timeout: 2500 });
    updateToast('toast-1', { duration: null });
    expect(update).toHaveBeenLastCalledWith('toast-1', { timeout: 0 });
  });
});

describe('closeToast', () => {
  test('closes by id and ignores a missing one', () => {
    closeToast('toast-1');
    expect(close).toHaveBeenCalledWith('toast-1');
    close.mockClear();
    closeToast('');
    expect(close).not.toHaveBeenCalled();
  });
});
