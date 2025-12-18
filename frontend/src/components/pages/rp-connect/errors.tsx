import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { Text } from 'components/redpanda-ui/components/typography';

import { type LintHint, LintHintSchema } from '../../../protogen/redpanda/api/common/v1/linthint_pb';

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
  const lintHints: Record<string, LintHint> = {};
  let hintIndex = 0;

  if (err instanceof ConnectError) {
    // First, check for lint hints (validation errors with line/column info)
    let hasSpecificHints = false;

    for (const detail of err.details) {
      if (isLintHint(detail)) {
        lintHints[`hint_${hintIndex}`] = detail.debug;
        hintIndex += 1;
        hasSpecificHints = true;
      } else if (isBadRequest(detail)) {
        // Handle field violations as lint hints
        for (const violation of detail.debug.fieldViolations) {
          lintHints[`hint_${hintIndex}`] = create(LintHintSchema, {
            line: 0,
            column: 0,
            hint: `${violation.field}: ${violation.description}`,
            lintType: 'error',
          });
          hintIndex += 1;
          hasSpecificHints = true;
        }
      }
    }

    // If no specific hints were found, create a generic error hint with additional context
    if (!hasSpecificHints) {
      // Build a more helpful error message using ConnectError properties
      let errorMessage = err.message;

      // Add error code context if available and different from message
      if (err.code) {
        const codeStr = String(err.code);
        if (!errorMessage.toLowerCase().includes(codeStr.toLowerCase())) {
          errorMessage = `[${codeStr}] ${errorMessage}`;
        }
      }

      lintHints[`hint_${hintIndex}`] = create(LintHintSchema, {
        line: 0,
        column: 0,
        hint: errorMessage || err.rawMessage || String(err),
        lintType: 'error',
      });
      hintIndex += 1;
    }
  } else {
    // For non-ConnectError errors, create a generic hint
    lintHints[`hint_${hintIndex}`] = create(LintHintSchema, {
      line: 0,
      column: 0,
      hint: err instanceof Error ? err.message : String(err),
      lintType: 'error',
    });
    hintIndex += 1;
  }

  return lintHints;
}

export function formatPipelineError(err: unknown): React.ReactNode {
  const details: React.ReactNode[] = [];
  let genDesc = String(err);
  if (err instanceof ConnectError) {
    genDesc = err.message;
    for (const detail of err.details) {
      if (isLintHint(detail)) {
        const hint = detail.debug;
        if (hint.line > 0) {
          details.push(`Line ${hint.line}, Col ${hint.column}: ${hint.hint}`);
        } else {
          details.push(hint.hint);
        }
      } else if (isBadRequest(detail)) {
        for (const v of detail.debug.fieldViolations) {
          details.push(`${v.field}: ${v.description}`);
        }
      }
    }
  }
  let desc = <Text as="span">{genDesc}</Text>;
  if (details.length > 0) {
    desc = (
      <>
        <Text as="span">{genDesc}</Text>
        <ul>
          {details.map((d) => (
            <li key={String(d)} style={{ listStylePosition: 'inside' }}>
              {d}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return desc;
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
