import { ConnectError } from '@connectrpc/connect';
import { Text } from '@redpanda-data/ui';
import { LintHint } from '../../../protogen/redpanda/api/common/v1/linthint_pb';

export function formatPipelineError(err: any): any {
  const details = [];
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
          {details.map((d, idx) => (
            <li style={{ listStylePosition: 'inside' }} key={idx}>
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

function isLintHint(obj: any): obj is { type: string; debug: LintHint } {
  return obj && obj.type === LintHint.typeName;
}

function isBadRequest(obj: any): obj is { type: string; debug: BadRequest } {
  return obj && obj.type === 'google.rpc.BadRequest';
}
