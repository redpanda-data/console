/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { UseFormReturn } from 'react-hook-form';
import { stringify } from 'yaml';
import { RESOURCE_TIERS } from '../remote-mcp-constants';
import type { Template } from '../templates/remote-mcp-templates';
import type { FormValues } from './schemas';

export function getTierById(id: string | undefined) {
  if (!id) return undefined;
  return RESOURCE_TIERS.find((t) => t.id === id || t.name === id);
}

export function applyTemplateToTool(form: UseFormReturn<FormValues>, toolIndex: number, template: Template) {
  const yamlString = stringify(template.yaml);
  const label = template.yaml.label as string | undefined;

  form.setValue(`tools.${toolIndex}.componentType`, template.componentType, {
    shouldValidate: true,
    shouldDirty: true,
  });
  form.setValue(`tools.${toolIndex}.config`, yamlString, { shouldValidate: true, shouldDirty: true });

  if (label && typeof label === 'string') {
    form.setValue(`tools.${toolIndex}.name`, label, { shouldValidate: true, shouldDirty: true });
  }

  form.setValue(`tools.${toolIndex}.selectedTemplate`, template.name, {
    shouldValidate: false,
    shouldDirty: true,
  });
}
