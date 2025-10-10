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
import {
  FormContainer,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ResourceTierSelect } from 'components/ui/connect/resource-tier-select';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';

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

        <FormContainer className="w-full" layout="default" onSubmit={form.handleSubmit(onSubmit)} width="full">
          <div className="space-y-6">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My MCP Server" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe what this MCP server does..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <TagsFieldList
              appendTag={appendTag}
              fieldName="tags"
              form={form}
              removeTag={removeTag}
              tagFields={tagFields}
            />

            <FormField
              control={form.control}
              name="resourcesTier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resources</FormLabel>
                  <FormControl>
                    <ResourceTierSelect onValueChange={field.onChange} value={field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormContainer>
      </div>
    </CardContent>
  </Card>
);
