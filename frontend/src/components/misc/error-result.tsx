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

const ErrorResult: React.FC<ErrorResultProps> = ({ error, title, message }) => {
  const [imageFailed, setImageFailed] = useState(false);
  if (!error) {
    return null;
  }

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

  let statusCode: number;
  let errorDetails: string | null = null;

  // Determine which type of error we're dealing with
  if (isConnectError(error)) {
    statusCode = getStatusCode(error.code);
    if (error.details && error.details.length > 0) {
      // Use type assertion to access the 'debug' property
      const detail = error.details[0] as { debug?: unknown };
      if (detail.debug) {
        errorDetails = JSON.stringify(detail.debug, null, 2); // Format JSON with 2 spaces for indentation
      }
    }
  } else if (isWrappedApiError(error)) {
    statusCode = error.statusCode;
  } else {
    // Fallback for unknown error type
    statusCode = HTTP_INTERNAL_ERROR;
  }

  const errorTitle = title || `Error ${statusCode}`;
  const errorMessage = message || error.message;

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-8 p-4 md:flex-nowrap">
      <div className="flex max-w-[700px] flex-col gap-4 p-5">
        <h2 className="font-semibold text-heading-xl">{errorTitle}</h2>
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
