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
        const hint = LintHint.fromJsonString(JSON.stringify(detail.debug));
        details.push(`Line ${hint.line}, Col ${hint.column}: ${hint.hint}`);
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

function isLintHint(obj: any): obj is { type: string; debug: any } {
  return obj && obj.type === LintHint.typeName;
}
