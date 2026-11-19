import type { FileRejection } from 'react-dropzone';

/** Preserve every rejected file's reasons in the same error delivered to the consumer. */
export function rejectedFilesError(rejections: readonly FileRejection[]): AggregateError {
  const errors = rejections.flatMap(({ file, errors: reasons }) =>
    reasons.length === 0
      ? [new Error(`${file.name}: File rejected`)]
      : reasons.map(({ message }) => new Error(`${file.name}: ${message}`))
  );
  return new AggregateError(errors, errors.map(({ message }) => message).join('\n'));
}
