import { ALL_CONTEXT_ID, CONTEXT_PREFIX_RE, DEFAULT_CONTEXT_ID } from './schema-context-utils';
import type { SchemaRegistrySubject } from '../../../state/rest-interfaces';

export function subjectsInContext<T extends SchemaRegistrySubject>(
  subjects: T[],
  contextsSupported: boolean,
  selectedContext: string
) {
  if (!contextsSupported || selectedContext === ALL_CONTEXT_ID) {
    return subjects;
  }
  if (selectedContext === DEFAULT_CONTEXT_ID) {
    return subjects.filter((s) => !CONTEXT_PREFIX_RE.test(s.name));
  }
  const prefix = `:${selectedContext}:`;
  return subjects.filter((s) => s.name.startsWith(prefix));
}

function subjectsMatchingName<T extends SchemaRegistrySubject>(subjects: T[], searchQuery: string) {
  try {
    const quickSearchRegExp = new RegExp(searchQuery, 'iu');
    return subjects.filter((subject) => Boolean(subject.name.match(quickSearchRegExp)));
  } catch {
    const searchLower = searchQuery.toLowerCase();
    return subjects.filter((subject) => subject.name.toLowerCase().includes(searchLower));
  }
}

export function subjectsMatchingSearch<T extends SchemaRegistrySubject>(
  subjects: T[],
  searchQuery: string,
  schemaUsages: { subject: string }[] | undefined
) {
  if (!searchQuery) {
    return subjects;
  }
  if (Number.isNaN(Number(searchQuery.trim()))) {
    return subjectsMatchingName(subjects, searchQuery);
  }
  const matchingSubjectNames = new Set(schemaUsages?.map((s) => s.subject) ?? []);
  return subjects.filter((subject) => matchingSubjectNames.has(subject.name));
}
