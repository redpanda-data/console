import { Code } from '@connectrpc/connect';
import type { ConnectError } from '@connectrpc/connect';
import { Avatars, Box, CodeBlock, HStack, Heading, Image, Stack, Text } from '@redpanda-data/ui';
import React from 'react';
import { capitalizeFirst } from 'utils/utils';
import type { WrappedApiError } from '../../state/restInterfaces';

interface ErrorResultProps {
  error?: ConnectError | WrappedApiError;
  title?: string;
  message?: string;
}

const ErrorResult: React.FC<ErrorResultProps> = ({ error, title, message }) => {
  if (!error) {
    return null;
  }

  // Type guard for ConnectError
  const isConnectError = (err: any): err is ConnectError => {
    return err && typeof err.code === 'number' && 'details' in err;
  };

  // Type guard for WrappedApiError
  const isWrappedApiError = (err: any): err is WrappedApiError => {
    return err && typeof err.statusCode === 'number';
  };

  // Map gRPC error codes to HTTP status codes
  const getStatusCode = (code: Code): number => {
    switch (code) {
      case Code.Unauthenticated:
        return 401;
      case Code.PermissionDenied:
        return 403;
      case Code.NotFound:
        return 404;
      case Code.AlreadyExists:
        return 409;
      case Code.FailedPrecondition:
        return 400;
      case Code.InvalidArgument:
        return 400;
      case Code.DeadlineExceeded:
        return 408;
      case Code.Unavailable:
        return 503;
      case Code.Internal:
        return 500;
      default:
        return 500;
    }
  };

  let statusCode: number;
  let errorDetails: string | null = null;

  // Determine which type of error we're dealing with
  if (isConnectError(error)) {
    statusCode = getStatusCode(error.code);
    if (error.details && error.details.length > 0) {
      // Use type assertion to access the 'debug' property
      const detail = error.details[0] as { debug?: any };
      if (detail.debug) {
        errorDetails = JSON.stringify(detail.debug, null, 2); // Format JSON with 2 spaces for indentation
      }
    }
  } else if (isWrappedApiError(error)) {
    statusCode = error.statusCode;
  } else {
    // Fallback for unknown error type
    statusCode = 500;
  }

  const errorTitle = title || `Error ${statusCode}`;
  const errorMessage = message || error.message;

  return (
    <HStack
      p={4}
      spacing={8}
      alignItems="center"
      justifyContent="center"
      w="full"
      flexWrap={{ base: 'wrap', md: 'nowrap' }}
      gap={8}
    >
      <Stack spacing={4} maxW="700px" p={5}>
        <Heading fontSize="2xl" lineHeight="short">
          {errorTitle}
        </Heading>
        <Text fontSize="lg">{capitalizeFirst(errorMessage)}</Text>
        {errorDetails && (
          <CodeBlock codeString={errorDetails} language="json" theme="light" showCopyButton maxW="50vw" />
        )}
      </Stack>
      <Box display="flex" alignItems="center" justifyContent="center" minW="300px">
        <Image
          w="full"
          maxW="300px"
          h="auto"
          display="block"
          src={Avatars.errorBananaSlipSvg}
          alt="Dev Redpanda"
          fallback={<Text color="gray.500">Error image not available</Text>}
          objectFit="contain"
        />
      </Box>
    </HStack>
  );
};

export default ErrorResult;
