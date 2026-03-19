import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';

type CreateTokenRefreshInterceptorArgs = {
  getAccessToken: () => string | undefined;
  refreshAccessToken: () => Promise<string>;
  onRefreshFailure?: (error: unknown) => void;
};

const isUnauthenticatedError = (error: unknown): error is ConnectError =>
  error instanceof ConnectError && error.code === Code.Unauthenticated;

const getRefreshedToken = async ({
  getAccessToken,
  refreshAccessToken,
  onRefreshFailure,
  originalError,
}: CreateTokenRefreshInterceptorArgs & { originalError: ConnectError }) => {
  let refreshedToken: string;

  try {
    refreshedToken = await refreshAccessToken();
  } catch (refreshError) {
    onRefreshFailure?.(refreshError);
    throw originalError;
  }

  const token = refreshedToken || getAccessToken();
  if (token) {
    return token;
  }

  const missingTokenError = new Error('Access token missing after silent refresh');
  onRefreshFailure?.(missingTokenError);
  throw originalError;
};

const retryRequestWithToken = async ({
  next,
  request,
  token,
  onRefreshFailure,
}: {
  next: ReturnType<Interceptor>;
  request: Parameters<ReturnType<Interceptor>>[0];
  token: string;
  onRefreshFailure?: (error: unknown) => void;
}) => {
  request.header.set('Authorization', `Bearer ${token}`);

  try {
    return await next(request);
  } catch (retryError) {
    if (isUnauthenticatedError(retryError)) {
      onRefreshFailure?.(retryError);
    }

    throw retryError;
  }
};

/**
 * Creates a Connect interceptor that retries a single unauthenticated request
 * after silently refreshing the access token.
 */
export const createTokenRefreshInterceptor =
  ({ getAccessToken, refreshAccessToken, onRefreshFailure }: CreateTokenRefreshInterceptorArgs): Interceptor =>
  (next) =>
  async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (!isUnauthenticatedError(error)) {
        throw error;
      }

      const token = await getRefreshedToken({
        getAccessToken,
        refreshAccessToken,
        onRefreshFailure,
        originalError: error,
      });

      return await retryRequestWithToken({
        next,
        request,
        token,
        onRefreshFailure,
      });
    }
  };
