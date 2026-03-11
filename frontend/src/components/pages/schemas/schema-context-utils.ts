/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { SchemaRegistryContextResponse } from '../../../react-query/api/schema-registry';
import type { SchemaRegistrySubject } from '../../../state/rest-interfaces';

export const CONTEXT_PREFIX_RE = /^:\.([^:]+):(.+)$/;

export type ParsedSubject = {
  context: string;
  displayName: string;
  qualifiedName: string;
};

// Extract context and display name from a subject.
// E.g. ":.staging:my-topic" → { context: "staging", … }
export function parseSubjectContext(name: string): ParsedSubject {
  const match = CONTEXT_PREFIX_RE.exec(name);
  if (match) {
    return {
      context: match[1],
      displayName: match[2],
      qualifiedName: name,
    };
  }
  return {
    context: 'default',
    displayName: name,
    qualifiedName: name,
  };
}

export const ALL_CONTEXT_ID = '__all__';
export const DEFAULT_CONTEXT_ID = '__default__';

export type DerivedContext = {
  id: string;
  label: string;
  subjectCount: number;
  mode: string;
  compatibility: string;
};

// Merge backend context list with subject counts for
// the dropdown. Order: Default, named (sorted), All.
export function deriveContexts(
  apiContexts: SchemaRegistryContextResponse[],
  subjects: SchemaRegistrySubject[]
): DerivedContext[] {
  const activeSubjects = subjects.filter((s) => !s.isSoftDeleted);
  const countByContext = new Map<string, number>();

  for (const subject of activeSubjects) {
    const { context } = parseSubjectContext(subject.name);
    const key = context === 'default' ? DEFAULT_CONTEXT_ID : context;
    countByContext.set(key, (countByContext.get(key) ?? 0) + 1);
  }

  const contexts: DerivedContext[] = [];

  // Default first, then named contexts alphabetically, then All at the bottom
  const namedApiContexts: SchemaRegistryContextResponse[] = [];
  let defaultContext: SchemaRegistryContextResponse | undefined;
  for (const ctx of apiContexts) {
    if (ctx.name === '.') {
      defaultContext = ctx;
      contexts.push({
        id: DEFAULT_CONTEXT_ID,
        label: 'Default',
        subjectCount: countByContext.get(DEFAULT_CONTEXT_ID) ?? 0,
        mode: ctx.mode,
        compatibility: ctx.compatibility,
      });
    } else {
      namedApiContexts.push(ctx);
    }
  }

  namedApiContexts.sort((a, b) => a.name.localeCompare(b.name));
  for (const ctx of namedApiContexts) {
    const contextKey = ctx.name.startsWith('.') ? ctx.name.slice(1) : ctx.name;
    contexts.push({
      id: ctx.name,
      label: ctx.name,
      subjectCount: countByContext.get(contextKey) ?? 0,
      mode: ctx.mode,
      compatibility: ctx.compatibility,
    });
  }

  // "All" uses the default context's mode/compat, falling back to empty strings
  contexts.push({
    id: ALL_CONTEXT_ID,
    label: 'All',
    subjectCount: activeSubjects.length,
    mode: defaultContext?.mode ?? '',
    compatibility: defaultContext?.compatibility ?? '',
  });

  return contexts;
}

// True for actual SR contexts (not the synthetic
// "All" or "Default" entries).
export function isNamedContext(contextId: string): boolean {
  return contextId !== ALL_CONTEXT_ID && contextId !== DEFAULT_CONTEXT_ID;
}

// Simple English pluralization: 1 subject / 3 subjects.
export function pluralize(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
