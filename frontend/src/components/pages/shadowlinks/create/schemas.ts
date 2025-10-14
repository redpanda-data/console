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

import { z } from 'zod';
import {
  ACLOperation,
  ACLPattern,
  ACLPermissionType,
  ACLResource,
} from 'protogen/redpanda/core/common/acl_pb';
import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

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
    name: z.string().min(1, 'Shadow link name is required').max(255),

    // Source cluster connection
    bootstrapServers: z
      .array(z.string().min(1, 'Bootstrap server URL is required'))
      .min(1, 'At least one bootstrap server is required'),

    // SCRAM credentials (optional)
    useScram: z.boolean(),
    scramUsername: z.string().optional(),
    scramPassword: z.string().optional(),
    scramMechanism: z.nativeEnum(ScramMechanism).optional(),

    // TLS configuration (optional)
    useTls: z.boolean(),
    tlsMode: z.enum([TLS_MODE.FILE_PATH, TLS_MODE.PEM]),

    // TLS file path mode
    tlsCaPath: z.string().optional(),
    tlsKeyPath: z.string().optional(),
    tlsCertPath: z.string().optional(),

    // TLS PEM mode
    tlsCaPem: z.string().optional(),
    tlsKeyPem: z.string().optional(),
    tlsCertPem: z.string().optional(),

    // Topic selection
    includeAllTopics: z.boolean(),
    listSpecificTopics: z.boolean(),
    specificTopicNames: z.string().optional(),
    includeTopicPrefix: z.boolean(),
    includePrefix: z.string().optional(),
    excludeTopicPrefix: z.boolean(),
    excludePrefix: z.string().optional(),

    // Topic properties
    topicProperties: z.array(z.string()).optional(),

    // Consumer offset sync
    enableConsumerOffsetSync: z.boolean(),
    consumerOffsetSyncInterval: z.number().min(1, 'Interval must be at least 1 second').optional(),
    includeAllGroups: z.boolean(),
    listSpecificGroups: z.boolean(),
    specificGroupNames: z.string().optional(),
    includeGroupPrefix: z.boolean(),
    includeGroupPrefixValue: z.string().optional(),
    excludeGroupPrefix: z.boolean(),
    excludeGroupPrefixValue: z.string().optional(),

    // ACL filters
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
  .refine(
    (data) => {
      // If SCRAM is enabled, username and password are required
      if (data.useScram) {
        return data.scramUsername && data.scramPassword && data.scramMechanism;
      }
      return true;
    },
    {
      message: 'Username, password, and mechanism are required when SCRAM is enabled',
      path: ['useScram'],
    }
  )
  .refine(
    (data) => {
      // If TLS is enabled with file path mode, at least CA path is required
      if (data.useTls && data.tlsMode === TLS_MODE.FILE_PATH) {
        return data.tlsCaPath;
      }
      return true;
    },
    {
      message: 'CA path is required when TLS file path mode is enabled',
      path: ['tlsCaPath'],
    }
  )
  .refine(
    (data) => {
      // If TLS is enabled with PEM mode, at least CA is required
      if (data.useTls && data.tlsMode === TLS_MODE.PEM) {
        return data.tlsCaPem;
      }
      return true;
    },
    {
      message: 'CA certificate is required when TLS PEM mode is enabled',
      path: ['tlsCaPem'],
    }
  )
  .refine(
    (data) => {
      // If key is provided in file path mode, cert must also be provided
      if (data.useTls && data.tlsMode === TLS_MODE.FILE_PATH && data.tlsKeyPath) {
        return data.tlsCertPath;
      }
      return true;
    },
    {
      message: 'Certificate path is required when key path is provided',
      path: ['tlsCertPath'],
    }
  )
  .refine(
    (data) => {
      // If cert is provided in file path mode, key must also be provided
      if (data.useTls && data.tlsMode === TLS_MODE.FILE_PATH && data.tlsCertPath) {
        return data.tlsKeyPath;
      }
      return true;
    },
    {
      message: 'Key path is required when certificate path is provided',
      path: ['tlsKeyPath'],
    }
  )
  .refine(
    (data) => {
      // If key is provided in PEM mode, cert must also be provided
      if (data.useTls && data.tlsMode === TLS_MODE.PEM && data.tlsKeyPem) {
        return data.tlsCertPem;
      }
      return true;
    },
    {
      message: 'Certificate is required when key is provided',
      path: ['tlsCertPem'],
    }
  )
  .refine(
    (data) => {
      // If cert is provided in PEM mode, key must also be provided
      if (data.useTls && data.tlsMode === TLS_MODE.PEM && data.tlsCertPem) {
        return data.tlsKeyPem;
      }
      return true;
    },
    {
      message: 'Key is required when certificate is provided',
      path: ['tlsKeyPem'],
    }
  )
  .refine(
    (data) => {
      // At least one topic selection option must be selected
      return (
        data.includeAllTopics || data.listSpecificTopics || data.includeTopicPrefix || data.excludeTopicPrefix
      );
    },
    {
      message: 'At least one topic selection option is required',
      path: ['topicSelection'], // Use a non-field path for root-level error
    }
  )
  .refine(
    (data) => {
      // If includeAllTopics is true, others must be false
      if (data.includeAllTopics) {
        return !data.listSpecificTopics && !data.includeTopicPrefix && !data.excludeTopicPrefix;
      }
      return true;
    },
    {
      message: 'Cannot select other options when "Include all topics" is enabled',
      path: ['topicSelection'], // Use a non-field path for root-level error
    }
  )
  .refine(
    (data) => {
      // If listSpecificTopics is checked, specificTopicNames must be provided
      if (data.listSpecificTopics) {
        return data.specificTopicNames && data.specificTopicNames.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Topic names are required when "List specific topics" is selected',
      path: ['specificTopicNames'],
    }
  )
  .refine(
    (data) => {
      // If includeTopicPrefix is checked, includePrefix must be provided
      if (data.includeTopicPrefix) {
        return data.includePrefix && data.includePrefix.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Prefix is required when "Include topic names starting with" is selected',
      path: ['includePrefix'],
    }
  )
  .refine(
    (data) => {
      // If excludeTopicPrefix is checked, excludePrefix must be provided
      if (data.excludeTopicPrefix) {
        return data.excludePrefix && data.excludePrefix.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Prefix is required when "Exclude topic names starting with" is selected',
      path: ['excludePrefix'],
    }
  )
  .refine(
    (data) => {
      // If consumer offset sync is enabled, at least one group filter option must be selected
      if (data.enableConsumerOffsetSync) {
        return (
          data.includeAllGroups || data.listSpecificGroups || data.includeGroupPrefix || data.excludeGroupPrefix
        );
      }
      return true;
    },
    {
      message: 'At least one consumer group selection option is required when sync is enabled',
      path: ['groupSelection'],
    }
  )
  .refine(
    (data) => {
      // If includeAllGroups is true, others must be false
      if (data.includeAllGroups) {
        return !data.listSpecificGroups && !data.includeGroupPrefix && !data.excludeGroupPrefix;
      }
      return true;
    },
    {
      message: 'Cannot select other options when "Include all groups" is enabled',
      path: ['groupSelection'],
    }
  )
  .refine(
    (data) => {
      // If listSpecificGroups is checked, specificGroupNames must be provided
      if (data.listSpecificGroups) {
        return data.specificGroupNames && data.specificGroupNames.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Group names are required when "List specific groups" is selected',
      path: ['specificGroupNames'],
    }
  )
  .refine(
    (data) => {
      // If includeGroupPrefix is checked, includeGroupPrefixValue must be provided
      if (data.includeGroupPrefix) {
        return data.includeGroupPrefixValue && data.includeGroupPrefixValue.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Prefix is required when "Include group names starting with" is selected',
      path: ['includeGroupPrefixValue'],
    }
  )
  .refine(
    (data) => {
      // If excludeGroupPrefix is checked, excludeGroupPrefixValue must be provided
      if (data.excludeGroupPrefix) {
        return data.excludeGroupPrefixValue && data.excludeGroupPrefixValue.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Prefix is required when "Exclude group names starting with" is selected',
      path: ['excludeGroupPrefixValue'],
    }
  )
;

export type FormValues = z.infer<typeof FormSchema>;

export const initialValues: FormValues = {
  name: '',
  bootstrapServers: [''],
  useScram: false,
  scramUsername: '',
  scramPassword: '',
  scramMechanism: ScramMechanism.SCRAM_SHA_256,
  useTls: false,
  tlsMode: TLS_MODE.FILE_PATH,
  tlsCaPath: '',
  tlsKeyPath: '',
  tlsCertPath: '',
  tlsCaPem: '',
  tlsKeyPem: '',
  tlsCertPem: '',
  includeAllTopics: true, // Default to include all
  listSpecificTopics: false,
  specificTopicNames: '',
  includeTopicPrefix: false,
  includePrefix: '',
  excludeTopicPrefix: false,
  excludePrefix: '',
  topicProperties: [],
  enableConsumerOffsetSync: false,
  consumerOffsetSyncInterval: 30,
  includeAllGroups: true,
  listSpecificGroups: false,
  specificGroupNames: '',
  includeGroupPrefix: false,
  includeGroupPrefixValue: '',
  excludeGroupPrefix: false,
  excludeGroupPrefixValue: '',
  aclFilters: [], // No default filter - user adds as needed
};
