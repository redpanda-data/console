/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { CircleUser, Link, Server, Waypoints } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { z } from 'zod';

const SECRET_ID_REGEX = /^[a-zA-Z0-9/_-]+$/;

export const SecretCreateFormSchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .regex(SECRET_ID_REGEX, 'ID must contain only letters, numbers, slashes, underscores, and hyphens'),
  value: z.string().min(1, 'Value is required'),
  scopes: z.array(z.number()).min(1, 'At least one scope is required'),
  labels: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional()
    .default([])
    .refine(
      (labels) =>
        labels.every((label) => (label.key === '' && label.value === '') || (label.key !== '' && label.value !== '')),
      'Both key and value must be provided for a label'
    )
    .refine((labels) => {
      const keys = labels.filter((l) => l.key).map((l) => l.key);
      return keys.length === new Set(keys).size;
    }, 'Label keys must be unique'),
});

export type SecretCreateFormValues = z.infer<typeof SecretCreateFormSchema>;

export const initialValues: SecretCreateFormValues = {
  id: '',
  value: '',
  scopes: [Scope.AI_GATEWAY, Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER],
  labels: [],
};

export const SCOPE_OPTIONS = [
  {
    value: String(Scope.AI_GATEWAY),
    label: (
      <span className="flex items-center gap-2">
        <Waypoints className="size-4" />
        AI Gateway
      </span>
    ),
  },
  {
    value: String(Scope.MCP_SERVER),
    label: (
      <span className="flex items-center gap-2">
        <MCPIcon className="size-4" />
        MCP Server
      </span>
    ),
  },
  {
    value: String(Scope.AI_AGENT),
    label: (
      <span className="flex items-center gap-2">
        <CircleUser className="size-4" />
        AI Agent
      </span>
    ),
  },
  {
    value: String(Scope.REDPANDA_CONNECT),
    label: (
      <span className="flex items-center gap-2">
        <Link className="size-4" />
        Redpanda Connect
      </span>
    ),
  },
  {
    value: String(Scope.REDPANDA_CLUSTER),
    label: (
      <span className="flex items-center gap-2">
        <Server className="size-4" />
        Redpanda Cluster
      </span>
    ),
  },
];
