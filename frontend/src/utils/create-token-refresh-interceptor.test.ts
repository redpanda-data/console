import { Code, ConnectError } from '@connectrpc/connect';

import { createTokenRefreshInterceptor } from './create-token-refresh-interceptor';

describe('createTokenRefreshInterceptor', () => {
  test('refreshes once and retries unauthenticated requests with the new token', async () => {
    let token = 'stale-token';
    const refreshAccessToken = vi.fn().mockImplementation(() => {
      token = 'fresh-token';
      return Promise.resolve(token);
    });
    const onRefreshFailure = vi.fn();
    const next = vi
      .fn()
      .mockRejectedValueOnce(new ConnectError('expired', Code.Unauthenticated))
      .mockResolvedValueOnce('ok');

    const interceptor = createTokenRefreshInterceptor({
      getAccessToken: () => token,
      refreshAccessToken,
      onRefreshFailure,
    });

    const request = { header: new Headers({ Authorization: 'Bearer stale-token' }) };

    const result = await interceptor(next)(request as never);

    expect(result).toBe('ok');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
    expect(request.header.get('Authorization')).toBe('Bearer fresh-token');
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });

  test('calls the refresh failure handler and rethrows the original auth error when refresh fails', async () => {
    const authError = new ConnectError('expired', Code.Unauthenticated);
    const refreshError = new Error('refresh failed');
    const refreshAccessToken = vi.fn().mockRejectedValue(refreshError);
    const onRefreshFailure = vi.fn();
    const next = vi.fn().mockRejectedValue(authError);

    const interceptor = createTokenRefreshInterceptor({
      getAccessToken: () => undefined,
      refreshAccessToken,
      onRefreshFailure,
    });

    await expect(interceptor(next)({ header: new Headers() } as never)).rejects.toBe(authError);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(onRefreshFailure).toHaveBeenCalledTimes(1);
    expect(onRefreshFailure).toHaveBeenCalledWith(refreshError);
  });

  test('does not loop when the retry is still unauthenticated', async () => {
    let token = 'stale-token';
    const retryError = new ConnectError('still expired', Code.Unauthenticated);
    const refreshAccessToken = vi.fn().mockImplementation(() => {
      token = 'fresh-token';
      return Promise.resolve(token);
    });
    const onRefreshFailure = vi.fn();
    const next = vi
      .fn()
      .mockRejectedValueOnce(new ConnectError('expired', Code.Unauthenticated))
      .mockRejectedValueOnce(retryError);

    const interceptor = createTokenRefreshInterceptor({
      getAccessToken: () => token,
      refreshAccessToken,
      onRefreshFailure,
    });

    await expect(interceptor(next)({ header: new Headers() } as never)).rejects.toBe(retryError);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
    expect(onRefreshFailure).toHaveBeenCalledTimes(1);
    expect(onRefreshFailure).toHaveBeenCalledWith(retryError);
  });
});
