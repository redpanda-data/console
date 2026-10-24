import type { ConnectError } from '@connectrpc/connect';
import { Code } from '@connectrpc/connect';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import React, { useState } from 'react';
import { capitalizeFirst } from 'utils/utils';

import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';
import type { WrappedApiError } from '../../state/rest-interfaces';

type ErrorResultProps = {
  error?: ConnectError | WrappedApiError | null;
  title?: string;
  message?: string;
};

// Type guard for ConnectError
const isConnectError = (err: unknown): err is ConnectError =>
  err !== null &&
  typeof err === 'object' &&
  'code' in err &&
  typeof (err as { code: unknown }).code === 'number' &&
  'details' in err;

// Type guard for WrappedApiError
const isWrappedApiError = (err: unknown): err is WrappedApiError =>
  err !== null &&
  typeof err === 'object' &&
  'statusCode' in err &&
  typeof (err as { statusCode: unknown }).statusCode === 'number';

// HTTP status codes
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TIMEOUT = 408;
const HTTP_CONFLICT = 409;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;

// Map gRPC error codes to HTTP status codes
const getStatusCode = (code: Code): number => {
  switch (code) {
    case Code.Unauthenticated:
      return HTTP_UNAUTHORIZED;
    case Code.PermissionDenied:
      return HTTP_FORBIDDEN;
    case Code.NotFound:
      return HTTP_NOT_FOUND;
    case Code.AlreadyExists:
      return HTTP_CONFLICT;
    case Code.FailedPrecondition:
      return HTTP_BAD_REQUEST;
    case Code.InvalidArgument:
      return HTTP_BAD_REQUEST;
    case Code.DeadlineExceeded:
      return HTTP_TIMEOUT;
    case Code.Unavailable:
      return HTTP_SERVICE_UNAVAILABLE;
    case Code.Internal:
      return HTTP_INTERNAL_ERROR;
    default:
      return HTTP_INTERNAL_ERROR;
  }
};

function getErrorData(error: ConnectError | WrappedApiError) {
  const statusCode = isConnectError(error)
    ? getStatusCode(error.code)
    : isWrappedApiError(error)
      ? error.statusCode
      : HTTP_INTERNAL_ERROR;
  const detail = isConnectError(error) ? (error.details?.[0] as { debug?: unknown } | undefined) : undefined;
  const errorDetails = detail?.debug ? JSON.stringify(detail.debug, null, 2) : null;
  return { statusCode, errorDetails };
}

const ErrorResult: React.FC<ErrorResultProps> = ({ error, title, message }) => {
  const [imageFailed, setImageFailed] = useState(false);
  if (!error) {
    return null;
  }

  const { statusCode, errorDetails } = getErrorData(error);

  const errorTitle = title || `Error ${statusCode}`;
  const errorMessage = message || error.message;

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-8 p-4 md:flex-nowrap">
      <div className="flex max-w-[700px] flex-col gap-4 p-5">
        <h2 className="text-heading-xl font-semibold">{errorTitle}</h2>
        <p className="text-body-lg">{capitalizeFirst(errorMessage)}</p>
        {errorDetails ? (
          <SimpleCodeBlock
            className="my-0 max-w-[50vw]"
            code={errorDetails}
            language="json"
            maxHeight="none"
            width="full"
          />
        ) : null}
      </div>
      <div className="flex min-w-[300px] items-center justify-center">
        {imageFailed ? (
          <p className="text-subtle">Error image not available</p>
        ) : (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a load event, not an interaction
          <img
            alt="Dev Redpanda"
            className="block h-auto w-full max-w-[300px] object-contain"
            onError={() => setImageFailed(true)}
            src={errorBananaSlip}
          />
        )}
      </div>
    </div>
  );
};

export default ErrorResult;
