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
export const DEFAULT_CONTEXT_LABEL = 'Default';

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
        label: DEFAULT_CONTEXT_LABEL,
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

// Convert a raw context name (e.g. from a URL param or parseSubjectContext)
// into the internal context ID used by the editor state.
// ".staging" → ".staging", "default" → DEFAULT_CONTEXT_ID, "prod" → ".prod"
export function contextNameToId(name: string): string {
  if (name === 'default') return DEFAULT_CONTEXT_ID;
  if (name.startsWith('.')) return name;
  return `.${name}`;
}

// Build a qualified subject name from context + subject.
// Named contexts (e.g. ".staging") → ":.staging:subject"
// Default context → plain "subject"
export function buildQualifiedSubjectName(contextId: string, subjectName: string): string {
  if (!subjectName) return '';
  if (isNamedContext(contextId)) return `:${contextId}:${subjectName}`;
  return subjectName;
}

// Map between internal context IDs and display labels.
// DEFAULT_CONTEXT_ID ('__default__') ↔ 'Default'; all others pass through.
export function contextIdToLabel(contextId: string): string {
  return contextId === DEFAULT_CONTEXT_ID ? DEFAULT_CONTEXT_LABEL : contextId;
}

export function contextLabelToId(label: string): string {
  return label === DEFAULT_CONTEXT_LABEL ? DEFAULT_CONTEXT_ID : label;
}

// Build qualified references for API calls (create/validate).
export function buildQualifiedReferences(
  refs: { name: string; subject: string; version: number; context: string }[]
): { name: string; subject: string; version: number }[] {
  return refs
    .filter((x) => x.name && x.subject)
    .map((r) => ({
      name: r.name,
      subject: buildQualifiedSubjectName(r.context, r.subject),
      version: r.version,
    }));
}

// Simple English pluralization: 1 subject / 3 subjects.
export function pluralize(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
