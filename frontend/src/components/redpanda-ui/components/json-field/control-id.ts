'use client';

// Copyright 2026 Redpanda Data, Inc.

export function jsonControlId(id: string, path: string[]): string {
  return `${id}-${encodeURIComponent(JSON.stringify(path))}`;
}
