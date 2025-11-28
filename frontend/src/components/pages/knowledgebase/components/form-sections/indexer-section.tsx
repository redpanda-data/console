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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { RegexPatternsField } from 'components/ui/regex/regex-patterns-field';
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
};

export const IndexerSection: React.FC<IndexerSectionProps> = ({ form, availableSecrets }) => {
  // Watch the separate fields directly
  const exactTopics = form.watch('exactTopics') || [];
  const regexPatterns = form.watch('regexPatterns') || [];

  // Update exact topics
  const handleExactTopicsChange = (topics: string[]) => {
    form.setValue('exactTopics', topics, { shouldValidate: true, shouldDirty: true });
  };

  // Update regex patterns
  const handleRegexPatternsChange = (patterns: string[]) => {
    form.setValue('regexPatterns', patterns, { shouldValidate: true, shouldDirty: true });
  };

  return (
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
                  <FormLabel required>Chunk Size</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="512"
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(Number.parseInt(e.target.value, 10) || 512)}
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

          <FormItem>
            <FormLabel>Exact Topics</FormLabel>
            <Text className="mb-2 text-muted-foreground text-sm">Select specific topic names from your cluster</Text>
            <TopicSelector onTopicsChange={handleExactTopicsChange} selectedTopics={exactTopics} />
          </FormItem>

          <RegexPatternsField
            helperText="Add regex patterns to match multiple topics dynamically (e.g., orders-.*)"
            label="Regex Patterns"
            onChange={handleRegexPatternsChange}
            patterns={regexPatterns}
          />

          <Text className="text-muted-foreground text-xs">
            Note: At least one exact topic OR one regex pattern must be provided.
          </Text>

          <FormField
            control={form.control}
            name="exactTopics"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="regexPatterns"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4">
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
                  value={field.value}
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
                      scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                      secretNamePlaceholder="e.g., REDPANDA_PASSWORD"
                      secretValueDescription="Your Redpanda user password"
                      secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                      secretValuePlaceholder="Enter password"
                      value={field.value}
                    />
                  </FormControl>
                  <FormDescription>All credentials are securely stored in your Secrets Store</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
        </div>
      </CardContent>
    </Card>
  );
};
