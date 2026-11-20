/** Read the protobuf oneof representation without asserting arbitrary form data. */
export function readOneofValue(value: unknown): { case: string | undefined; value: unknown } {
  if (value === undefined || value === null) {
    return { case: undefined, value: undefined };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a protobuf oneof object.');
  }
  const oneofCase = 'case' in value ? value.case : undefined;
  if (oneofCase !== undefined && typeof oneofCase !== 'string') {
    throw new TypeError('Expected a string protobuf oneof case.');
  }
  return { case: oneofCase, value: 'value' in value ? value.value : undefined };
}
