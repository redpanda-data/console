// Copyright 2026 Redpanda Data, Inc.

declare module 'rp_console/config' {
  export function getGrpcBasePath(overrideUrl?: string): string;
}
