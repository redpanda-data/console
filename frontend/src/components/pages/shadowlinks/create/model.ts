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
      fetchPartitionMaxBytes: z.number(),
    }),
    // TLS configuration
    useTls: z.boolean(),

    // mTLS configuration
    useMtls: z.boolean(),
    mtlsMode: z.enum([TLS_MODE.FILE_PATH, TLS_MODE.PEM]),
    mtls: z.object({
      ca: z
        .object({
          filePath: z.string().optional(),
          pemContent: z.string().optional(),
          fileName: z.string().optional(),
        })
        .optional(),
      clientCert: z
        .object({
          filePath: z.string().optional(),
          pemContent: z.string().optional(),
          fileName: z.string().optional(),
        })
        .optional(),
      clientKey: z
        .object({
          filePath: z.string().optional(),
          pemContent: z.string().optional(),
          fileName: z.string().optional(),
        })
        .optional(),
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

    // If mTLS is enabled, validate requirements
    if (data.useMtls) {
      // CA certificate is mandatory when mTLS is enabled
      const hasCaCert =
        data.mtlsMode === TLS_MODE.FILE_PATH
          ? Boolean(data.mtls.ca?.filePath?.trim())
          : Boolean(data.mtls.ca?.pemContent?.trim());

      if (!hasCaCert) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CA certificate is required when mTLS is enabled',
          path: ['mtls', 'ca'],
        });
      }

      // Validate client key and cert consistency (both optional, but if one is provided, both must be)
      const hasClientKey =
        data.mtlsMode === TLS_MODE.FILE_PATH
          ? Boolean(data.mtls.clientKey?.filePath?.trim())
          : Boolean(data.mtls.clientKey?.pemContent?.trim());

      const hasClientCert =
        data.mtlsMode === TLS_MODE.FILE_PATH
          ? Boolean(data.mtls.clientCert?.filePath?.trim())
          : Boolean(data.mtls.clientCert?.pemContent?.trim());

      if (hasClientKey && !hasClientCert) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Client certificate is required when client private key is provided',
          path: ['mtls', 'clientCert'],
        });
      }

      if (hasClientCert && !hasClientKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Client private key is required when client certificate is provided',
          path: ['mtls', 'clientKey'],
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
    fetchMinBytes: 5_242_880, // 5MiB
    fetchMaxBytes: 20_971_520, // 20MiB
    fetchPartitionMaxBytes: 1_048_576, // 1MiB
  },
  useScram: true,
  scramCredentials: {
    username: '',
    password: '',
    mechanism: ScramMechanism.SCRAM_SHA_256,
  },
  useTls: true,
  useMtls: false,
  mtlsMode: TLS_MODE.PEM,
  mtls: {
    ca: undefined,
    clientCert: undefined,
    clientKey: undefined,
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
