import { ALL_CONTEXT_ID, CONTEXT_PREFIX_RE, DEFAULT_CONTEXT_ID } from './schema-context-utils';
import type { SchemaRegistrySubject } from '../../../state/rest-interfaces';

// Subjects in the selected context. "All", or a registry without context
// support, keeps every subject.
export function subjectsInContext<T extends SchemaRegistrySubject>(
  subjects: T[],
  contextsSupported: boolean,
  selectedContext: string
): T[] {
  if (!contextsSupported || selectedContext === ALL_CONTEXT_ID) {
    return subjects;
  }
  if (selectedContext === DEFAULT_CONTEXT_ID) {
    return subjects.filter((s) => !CONTEXT_PREFIX_RE.test(s.name));
  }
  const prefix = `:${selectedContext}:`;
  return subjects.filter((s) => s.name.startsWith(prefix));
}

// Find by regex or string matching
function subjectsMatchingName<T extends SchemaRegistrySubject>(subjects: T[], searchQuery: string): T[] {
  try {
    const quickSearchRegExp = new RegExp(searchQuery, 'i');
    return subjects.filter((subject) => Boolean(subject.name.match(quickSearchRegExp)));
  } catch {
    const searchLower = searchQuery.toLowerCase();
    return subjects.filter((subject) => subject.name.toLowerCase().includes(searchLower));
  }
}

// The search box matches a number as a schema ID (the subjects that use that
// schema) and anything else against subject names.
export function subjectsMatchingSearch<T extends SchemaRegistrySubject>(
  subjects: T[],
  searchQuery: string,
  schemaUsages: { subject: string }[] | undefined
): T[] {
  if (!searchQuery) {
    return subjects;
  }
  if (Number.isNaN(Number(searchQuery.trim()))) {
    return subjectsMatchingName(subjects, searchQuery);
  }
  const matchingSubjectNames = new Set(schemaUsages?.map((s) => s.subject) ?? []);
  return subjects.filter((subject) => matchingSubjectNames.has(subject.name));
}
