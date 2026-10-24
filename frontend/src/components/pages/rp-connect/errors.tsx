import { type LintHint, LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';

/**
 * Extracts lint hints from a ConnectError for display in LintResults component.
 * Converts all errors (validation errors, field violations, and generic errors) to lint hints.
 *
 * Key differences from formatPipelineError:
 * - Returns structured LintHint objects (for LintResults component)
 * - formatPipelineError returns JSX (for toast erroring messaging)
 *
 * Leverages ConnectError properties:
 * - err.code: gRPC status code (e.g., "invalid_argument", "not_found")
 * - err.message: Human-readable error message
 * - err.rawMessage: Raw error from server
 * - err.details: Array of error details (LintHint, BadRequest, etc.)
 */
export function extractLintHintsFromError(err: unknown): Record<string, LintHint> {
  if (!(err instanceof ConnectError)) {
    return toHintRecord([errorHint(err instanceof Error ? err.message : String(err))]);
  }

  // Specific hints (validation errors with line/column info, field violations) win; otherwise fall
  // back to a generic error hint with additional context.
  const hints = lintHintsFromDetails(err.details);
  return toHintRecord(hints.length > 0 ? hints : [errorHint(connectErrorHintText(err))]);
}

export function formatPipelineError(err: unknown): React.ReactNode {
  const message = err instanceof ConnectError ? err.message : String(err);
  const details = err instanceof ConnectError ? lintHintsFromDetails(err.details).map(lintHintText) : [];
  if (details.length === 0) {
    return <span className="text-body">{message}</span>;
  }
  return (
    <>
      <span className="text-body">{message}</span>
      <ul>
        {details.map((detail) => (
          <li key={detail} style={{ listStylePosition: 'inside' }}>
            {detail}
          </li>
        ))}
      </ul>
    </>
  );
}

function errorHint(hint: string): LintHint {
  return create(LintHintSchema, { line: 0, column: 0, hint, lintType: 'error' });
}

function toHintRecord(hints: LintHint[]): Record<string, LintHint> {
  return Object.fromEntries(hints.map((hint, index) => [`hint_${index}`, hint]));
}

/** Lint hints carried by the error details, with each field violation converted to a hint. */
function lintHintsFromDetails(details: ConnectError['details']): LintHint[] {
  const hints: LintHint[] = [];
  for (const detail of details) {
    if (isLintHint(detail)) {
      hints.push(detail.debug);
    } else if (isBadRequest(detail)) {
      hints.push(...detail.debug.fieldViolations.map((v) => errorHint(`${v.field}: ${v.description}`)));
    }
  }
  return hints;
}

/** The error message, prefixed with the error code when the message doesn't already mention it. */
function connectErrorHintText(err: ConnectError): string {
  const code = String(err.code);
  if (err.code && !err.message.toLowerCase().includes(code.toLowerCase())) {
    return `[${code}] ${err.message}`;
  }
  return err.message || err.rawMessage || String(err);
}

function lintHintText(hint: LintHint): string {
  return hint.line > 0 ? `Line ${hint.line}, Col ${hint.column}: ${hint.hint}` : hint.hint;
}

type BadRequest = {
  fieldViolations: FieldViolation[];
};

type FieldViolation = {
  field: string;
  description: string;
};

function isLintHint(obj: unknown): obj is { type: string; debug: LintHint } {
  return obj !== null && typeof obj === 'object' && 'type' in obj && obj.type === LintHintSchema.typeName;
}

function isBadRequest(obj: unknown): obj is { type: string; debug: BadRequest } {
  return obj !== null && typeof obj === 'object' && 'type' in obj && obj.type === 'google.rpc.BadRequest';
}
