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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { RESOURCE_TIERS } from '../../remote-mcp-constants';
import type { FormValues } from '../schemas';
import { TagsFieldList } from './tags-field-list';

interface MetadataStepProps {
  form: UseFormReturn<FormValues>;
  tagFields: UseFieldArrayReturn<FormValues, 'tags', 'id'>['fields'];
  appendTag: UseFieldArrayReturn<FormValues, 'tags', 'id'>['append'];
  removeTag: UseFieldArrayReturn<FormValues, 'tags', 'id'>['remove'];
  onSubmit: (values: FormValues) => Promise<void>;
}

export const MetadataStep: React.FC<MetadataStepProps> = ({ form, tagFields, appendTag, removeTag, onSubmit }) => {
  return (
    <Card size="full">
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <Heading level={2}>Server Metadata</Heading>
            <Text variant="muted">Configure the basic information and resources for your MCP server.</Text>
          </div>

          <FormContainer className="w-full" onSubmit={form.handleSubmit(onSubmit)} layout="default" width="full">
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

              <TagsFieldList form={form} tagFields={tagFields} appendTag={appendTag} removeTag={removeTag} />

              <FormField
                control={form.control}
                name="resourcesTier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resources</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select resource tier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RESOURCE_TIERS.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
};
