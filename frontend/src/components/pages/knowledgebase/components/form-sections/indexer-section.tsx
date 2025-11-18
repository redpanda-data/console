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

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Text } from 'components/redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from 'components/ui/secret/secret-selector';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import type { UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';
import { TopicSelector } from '../../topic-selector';
import { UserDropdown } from '../form-fields/user-dropdown';

type IndexerSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  availableSecrets: Array<{ id: string; name: string }>;
  credentialChoice: 'auto' | 'manual';
};

export const IndexerSection: React.FC<IndexerSectionProps> = ({ form, availableSecrets, credentialChoice }) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Indexer</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="chunkSize"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel required>Chunk Size</FormLabel>
                  <Text className="font-medium text-sm">{field.value}</Text>
                </div>
                <FormControl>
                  <Slider
                    max={2048}
                    min={128}
                    onValueChange={(values) => field.onChange(values[0])}
                    step={64}
                    value={[field.value]}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="chunkOverlap"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Chunk Overlap</FormLabel>
                <FormControl>
                  <Input
                    placeholder="100"
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 100)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="inputTopics"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <TopicSelector onTopicsChange={field.onChange} selectedTopics={field.value} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="credentialChoice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Redpanda Credentials</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} value={field.value}>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 rounded-md border p-4 opacity-50">
                      <RadioGroupItem disabled value="auto" />
                      <div className="space-y-1 leading-none">
                        <Text className="font-medium">Auto-generate credentials (Coming Soon)</Text>
                        <Text className="text-sm" variant="muted">
                          We'll create a unique user and password for this knowledge base automatically
                        </Text>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 rounded-md border p-4">
                      <RadioGroupItem value="manual" />
                      <div className="space-y-1 leading-none">
                        <Text className="font-medium">Provide your own credentials</Text>
                        <Text className="text-sm" variant="muted">
                          Use existing Redpanda username and password
                        </Text>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {credentialChoice === 'manual' && (
          <>
            <FormField
              control={form.control}
              name="redpandaUsername"
              render={({ field }) => (
                <UserDropdown
                  errorMessage={form.formState.errors.redpandaUsername?.message}
                  helperText="Select from existing Redpanda users"
                  isRequired
                  label="Redpanda Username"
                  onChange={field.onChange}
                  value={field.value || ''}
                />
              )}
            />

            <FormField
              control={form.control}
              name="redpandaPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Redpanda Password</FormLabel>
                  <FormControl>
                    <SecretSelector
                      availableSecrets={availableSecrets}
                      dialogDescription="Create a new secret for your Redpanda user password. The secret will be stored securely."
                      dialogTitle="Create Redpanda password secret"
                      emptyStateMessage="Create a secret to securely store your Redpanda password"
                      onChange={field.onChange}
                      placeholder="Select password or create new"
                      scopes={[Scope.REDPANDA_CONNECT]}
                      secretNamePlaceholder="e.g., REDPANDA_PASSWORD"
                      secretValueDescription="Your Redpanda user password"
                      secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                      secretValuePlaceholder="Enter password"
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription>All credentials are securely stored in your Secrets Store</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {credentialChoice === 'manual' && (
          <FormField
            control={form.control}
            name="redpandaSaslMechanism"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>SASL Mechanism</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(Number.parseInt(value, 10))}
                  value={String(field.value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}>SCRAM-SHA-256</SelectItem>
                    <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512)}>SCRAM-SHA-512</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </CardContent>
  </Card>
);
