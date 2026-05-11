const DEFAULT_AUTOFORM_TEST_ID_PREFIX = 'autoform';

function normalizeSegment(value: string | number | null | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s._[\]]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function resolveAutoFormTestIdPrefix(testId?: string): string {
  return normalizeSegment(testId) || DEFAULT_AUTOFORM_TEST_ID_PREFIX;
}

export function buildAutoFormTestId(prefix: string, ...segments: Array<string | number | null | undefined>): string {
  const normalizedSegments = segments.map(normalizeSegment).filter(Boolean);
  return [resolveAutoFormTestIdPrefix(prefix), ...normalizedSegments].join('-');
}

export function getAutoFormFieldTestId(prefix: string, path: string | string[], slot?: string | number): string {
  const normalizedPath = Array.isArray(path) ? path.join('.') : path;
  return buildAutoFormTestId(prefix, 'field', normalizedPath, slot);
}

export function getAutoFormCollectionRowTestId(prefix: string, path: string | string[], index: number): string {
  return getAutoFormFieldTestId(prefix, path, `row-${index}`);
}

export function getAutoFormCollectionRemoveTestId(prefix: string, path: string | string[], index: number): string {
  return getAutoFormFieldTestId(prefix, path, `remove-${index}`);
}

export function getAutoFormChoiceTestId(
  prefix: string,
  path: string | string[],
  kind: 'option' | 'group' | 'selected',
  value: string | number
): string {
  return getAutoFormFieldTestId(prefix, path, `${kind}-${value}`);
}

export { DEFAULT_AUTOFORM_TEST_ID_PREFIX };
