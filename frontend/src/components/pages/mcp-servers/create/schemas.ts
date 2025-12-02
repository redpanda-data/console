/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { RESOURCE_TIERS } from 'components/ui/connect/resource-tier-select';
import { MCPServer_Tool_ComponentType } from 'react-query/api/remote-mcp';
import { parse } from 'yaml';
import { z } from 'zod';

// Zod schema for tags
export const TagSchema = z.object({
  key: z.string().trim().min(0).max(64, { message: 'Key must be at most 64 characters' }),
  value: z.string().trim().min(0).max(256, { message: 'Value must be at most 256 characters' }),
});

// Zod schema for tools
export const ToolSchema = z
  .object({
    name: z
      .string({ required_error: 'Tool name is required' })
      .trim()
      .min(1, { message: 'Tool name is required' })
      .max(100, { message: 'Tool name must be at most 100 characters' }),
    componentType: z.nativeEnum(MCPServer_Tool_ComponentType, {
      required_error: 'Component type is required',
    }),
    config: z.string({ required_error: 'YAML configuration is required' }).refine((val) => {
      try {
        parse(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid YAML configuration'),
    selectedTemplate: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    // Ensure YAML label matches the tool name if YAML parses
    try {
      const doc = parse(val.config);
      if (doc && typeof doc === 'object' && 'label' in doc) {
        const label = (doc as { label?: unknown }).label;
        if (typeof label === 'string' && label !== val.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'YAML label must match Tool Name',
            path: ['name'],
          });
        }
      }
    } catch {
      // handled above by YAML validation
    }
  });

// Main form schema
export const FormSchema = z
  .object({
    displayName: z
      .string({ required_error: 'Display name is required' })
      .trim()
      .min(1, { message: 'Display name is required' }),
    description: z.string().trim().optional().default(''),
    tags: z.array(TagSchema).refine(
      (arr) => {
        const keys = arr.map((t) => t.key.trim()).filter((k) => k.length > 0);
        return keys.length === new Set(keys).size;
      },
      { message: 'Tags must have unique keys' }
    ),
    resourcesTier: z.string().min(1, { message: 'Resource tier selection is required' }),
    tools: z
      .array(ToolSchema)
      .min(1, { message: 'At least one tool is required' })
      .refine(
        (arr) => {
          const names = arr.map((t) => t.name.trim()).filter((n) => n.length > 0);
          return names.length === new Set(names).size;
        },
        { message: 'Tool names must be unique' }
      ),
    serviceAccountName: z
      .string()
      .min(3, 'Service account name must be at least 3 characters')
      .max(128, 'Service account name must be at most 128 characters')
      .regex(/^[^<>]+$/, 'Service account name cannot contain < or > characters')
      .optional()
      .default(''),
  })
  .strict();

export type FormValues = z.infer<typeof FormSchema>;

// Initial form values
export const initialValues: FormValues = {
  displayName: '',
  description: '',
  tags: [],
  resourcesTier: RESOURCE_TIERS[0]?.id ?? 'XSmall',
  tools: [
    {
      name: '',
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      config: '',
    },
  ],
  serviceAccountName: '',
};
