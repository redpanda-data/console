import type { FileRejection } from 'react-dropzone';

/** Copy shown in place of the per-file reasons, fixed or derived from the rejections. */
export type DropzoneRejectionMessage = string | ((rejections: readonly FileRejection[]) => string);

/**
 * Preserve every rejected file's reasons in the same error delivered to the consumer. A `message` replaces the
 * joined reasons as the error's message; the reasons stay in `errors`.
 */
export function rejectedFilesError(
  rejections: readonly FileRejection[],
  message?: DropzoneRejectionMessage
): AggregateError {
  const errors = rejections.flatMap(({ file, errors: reasons }) =>
    reasons.length === 0
      ? [new Error(`${file.name}: File rejected`)]
      : reasons.map(({ message: reason }) => new Error(`${file.name}: ${reason}`))
  );
  const summary = typeof message === 'function' ? message(rejections) : message;
  return new AggregateError(errors, summary ?? errors.map(({ message: reason }) => reason).join('\n'));
}
