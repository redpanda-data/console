// Copyright 2026 Redpanda Data, Inc.

/** Show a safe text explanation, never an error stack or raw object interpolation. */
export function editorLoadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const reason = error.cause instanceof Error ? error.cause.message : error.message;
    return reason === '' ? 'The editor module could not be downloaded.' : reason;
  }
  return typeof error === 'string' && error !== '' ? error : 'The editor module could not be downloaded.';
}
