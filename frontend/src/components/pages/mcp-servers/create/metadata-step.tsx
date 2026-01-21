/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ResourceTierSelect } from 'components/ui/connect/resource-tier-select';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import { isFeatureFlagEnabled } from 'config';
import { Controller, type UseFieldArrayReturn, type UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';

type MetadataStepProps = {
  form: UseFormReturn<FormValues>;
  tagFields: UseFieldArrayReturn<FormValues, 'tags', 'id'>['fields'];
  appendTag: UseFieldArrayReturn<FormValues, 'tags', 'id'>['append'];
  removeTag: UseFieldArrayReturn<FormValues, 'tags', 'id'>['remove'];
  onSubmit: (values: FormValues) => Promise<void>;
};

export const MetadataStep: React.FC<MetadataStepProps> = ({ form, tagFields, appendTag, removeTag, onSubmit }) => (
  <Card size="full">
    <CardContent>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <Heading level={2}>Server Metadata</Heading>
          <Text variant="muted">Configure the basic information and resources for your MCP server.</Text>
        </div>

        <form className="w-full space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Field data-invalid={!!form.formState.errors.displayName}>
              <FieldLabel htmlFor="displayName" required>
                Display Name
              </FieldLabel>
              <Input
                id="displayName"
                placeholder="My MCP Server"
                {...form.register('displayName')}
                aria-describedby={form.formState.errors.displayName ? 'displayName-error' : undefined}
                aria-invalid={!!form.formState.errors.displayName}
              />
              {!!form.formState.errors.displayName && (
                <FieldError id="displayName-error">{form.formState.errors.displayName.message}</FieldError>
              )}
            </Field>

            <Field data-invalid={!!form.formState.errors.description}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                placeholder="Describe what this MCP server does..."
                {...form.register('description')}
                aria-describedby={form.formState.errors.description ? 'description-error' : undefined}
                aria-invalid={!!form.formState.errors.description}
              />
              {!!form.formState.errors.description && (
                <FieldError id="description-error">{form.formState.errors.description.message}</FieldError>
              )}
            </Field>

            <TagsFieldList
              appendTag={appendTag}
              fieldName="tags"
              form={form}
              removeTag={removeTag}
              tagFields={tagFields}
            />

            <Field data-invalid={!!form.formState.errors.resourcesTier}>
              <FieldLabel htmlFor="resourcesTier">Resources</FieldLabel>
              <Controller
                control={form.control}
                name="resourcesTier"
                render={({ field }) => <ResourceTierSelect onValueChange={field.onChange} value={field.value} />}
              />
              {!!form.formState.errors.resourcesTier && (
                <FieldError>{form.formState.errors.resourcesTier.message}</FieldError>
              )}
            </Field>

            {isFeatureFlagEnabled('enableMcpServiceAccount') && (
              <Field data-invalid={!!form.formState.errors.serviceAccountName}>
                <FieldLabel htmlFor="serviceAccountName" required>
                  Service Account Name
                </FieldLabel>
                <Input
                  id="serviceAccountName"
                  placeholder="e.g., cluster-abc123-mcp-my-server-sa"
                  {...form.register('serviceAccountName')}
                  aria-describedby={form.formState.errors.serviceAccountName ? 'serviceAccountName-error' : undefined}
                  aria-invalid={!!form.formState.errors.serviceAccountName}
                />
                <FieldDescription>
                  This service account will be created automatically when you create the MCP server.
                </FieldDescription>
                {!!form.formState.errors.serviceAccountName && (
                  <FieldError id="serviceAccountName-error">
                    {form.formState.errors.serviceAccountName.message}
                  </FieldError>
                )}
              </Field>
            )}
          </div>
        </form>
      </div>
    </CardContent>
  </Card>
);
