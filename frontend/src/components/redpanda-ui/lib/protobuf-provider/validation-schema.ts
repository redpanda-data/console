import { type DescMessage, isMessage, type MessageShape, type MessageValidType } from '@bufbuild/protobuf';
import { createValidator, type ValidatorOptions, type Violation } from '@bufbuild/protovalidate';
import type { StandardSchemaV1 } from '@standard-schema/spec';

function violationIssue(violation: Violation): StandardSchemaV1.Issue {
  const path: Array<string | number> = [];
  for (const segment of violation.field) {
    switch (segment.kind) {
      case 'field':
        path.push(...(segment.oneof === undefined ? [segment.localName] : [segment.oneof.localName, 'value']));
        break;
      case 'oneof':
        path.push(segment.localName);
        break;
      case 'list_sub':
        path.push(segment.index);
        break;
      case 'map_sub':
        path.push(typeof segment.key === 'number' ? segment.key : String(segment.key));
        break;
      case 'extension':
        path.push(`[${segment.typeName}]`);
        break;
      default:
        throw new Error(segment satisfies never);
    }
  }
  if (violation.forKey) {
    path.push('$key');
  }
  return { path, message: violation.message };
}

/** Preserve map-key metadata that the upstream Standard Schema adapter discards. */
export function createProtoValidationSchema<Desc extends DescMessage>(
  desc: Desc,
  options?: ValidatorOptions
): StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>> {
  const validator = createValidator(options);
  return {
    '~standard': {
      version: 1,
      vendor: 'protovalidate-es',
      validate(value) {
        if (!isMessage(value, desc)) {
          return { issues: [{ message: `Expected a ${desc.typeName} protobuf message.` }] };
        }
        const result = validator.validate(desc, value);
        switch (result.kind) {
          case 'valid':
            return { value: result.message };
          case 'invalid':
            return { issues: result.violations.map(violationIssue) };
          case 'error':
            throw result.error;
          default:
            throw new Error(result satisfies never);
        }
      },
    },
  };
}
