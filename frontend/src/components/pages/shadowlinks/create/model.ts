/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { FilterType, PatternType, ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import { z } from 'zod';

// TLS mode: either file paths or PEM content
export const TLS_MODE = {
  FILE_PATH: 'file_path',
  PEM: 'pem',
} as const;

export type TLSMode = (typeof TLS_MODE)[keyof typeof TLS_MODE];

// Form schema with validation
export const FormSchema = z
  .object({
    // Basic info
    name: z.string().min(1, 'Shadow link name is required'),

    // Source cluster connection
    bootstrapServers: z
      .array(
        z.object({
          value: z
            .string()
            .trim()
            .min(1, 'at least one server url is required')
            .regex(/^[a-zA-Z0-9.-]+:\d+$/, 'Must be in format host:port (e.g., localhost:9092)'),
        })
      )
      .min(1, 'At least one bootstrap server is required'),

    // SCRAM credentials (optional)
    useScram: z.boolean(),
    scramCredentials: z
      .object({
        username: z.string(),
        password: z.string(),
        mechanism: z.nativeEnum(ScramMechanism),
      })
      .optional(),
    advanceClientOptions: z.object({
      metadataMaxAgeMs: z.number(),
      connectionTimeoutMs: z.number(),
      retryBackoffMs: z.number(),
      fetchWaitMaxMs: z.number(),
      fetchMinBytes: z.number(),
      fetchMaxBytes: z.number(),
    }),
    // TLS configuration (optional)
    useTls: z.boolean(),
    tls: z.object({
      mode: z.enum([TLS_MODE.FILE_PATH, TLS_MODE.PEM]),
      caPath: z.string().optional(),
      keyPath: z.string().optional(),
      certPath: z.string().optional(),
      caPem: z.string().optional(),
      keyPem: z.string().optional(),
      certPem: z.string().optional(),
    }),

    // Topic selection
    topicsMode: z.enum(['all', 'specify']),
    topics: z.array(
      z.object({
        patterType: z.nativeEnum(PatternType),
        filterType: z.nativeEnum(FilterType),
        name: z.string().trim().min(1, 'name is required'),
      })
    ),
    // Topic properties
    topicProperties: z.array(z.string()).optional(),

    // Consumer offset sync
    enableConsumerOffsetSync: z.boolean(),
    consumersMode: z.enum(['all', 'specify']),
    consumers: z.array(
      z.object({
        patterType: z.nativeEnum(PatternType),
        filterType: z.nativeEnum(FilterType),
        name: z.string().trim().min(1, 'name is required'),
      })
    ),

    // ACL filters
    aclsMode: z.enum(['all', 'specify']),
    aclFilters: z
      .array(
        z.object({
          // Resource filter
          resourceType: z.nativeEnum(ACLResource).optional(),
          resourcePattern: z.nativeEnum(ACLPattern).optional(),
          resourceName: z.string().optional(),

          // Access filter
          principal: z.string().optional(),
          operation: z.nativeEnum(ACLOperation).optional(),
          permissionType: z.nativeEnum(ACLPermissionType).optional(),
          host: z.string().optional(),
        })
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    // If SCRAM is enabled, username and password are required
    if (data.useScram) {
      if (!data.scramCredentials?.username?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Username is required when SCRAM is enabled',
          path: ['scramCredentials', 'username'],
        });
      }
      if (!data.scramCredentials?.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Password is required when SCRAM is enabled',
          path: ['scramCredentials', 'password'],
        });
      }
    }
  });

export type FormValues = z.infer<typeof FormSchema>;

export const initialValues: FormValues = {
  name: '',
  bootstrapServers: [{ value: '' }],
  advanceClientOptions: {
    metadataMaxAgeMs: 10_000, // 10 sec
    connectionTimeoutMs: 1000, // 1 sec
    retryBackoffMs: 100, // 100 ms
    fetchWaitMaxMs: 500, // 500 ms
    fetchMinBytes: 5_242_880, // 20MiB
    fetchMaxBytes: 20_971_520, // 20MiB
  },
  useScram: true,
  scramCredentials: {
    username: '',
    password: '',
    mechanism: ScramMechanism.SCRAM_SHA_256,
  },
  useTls: true,
  tls: {
    mode: TLS_MODE.FILE_PATH,
    caPath: '',
    keyPath: '',
    certPath: '',
    caPem: '',
    keyPem: '',
    certPem: '',
  },
  topicsMode: 'all',
  topics: [],
  topicProperties: [],
  enableConsumerOffsetSync: false,
  consumersMode: 'all',
  consumers: [],
  aclsMode: 'all',
  aclFilters: [], // No default filter - user adds as needed
};
