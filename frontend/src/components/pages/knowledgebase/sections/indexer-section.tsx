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

import { RegexPatternsField } from 'components/ui/regex/regex-patterns-field';
import { TableOfContents } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';
import { Text } from '../../../redpanda-ui/components/typography';
import { GENERIC_SECRET_VALUE_PATTERN, SecretSelector } from '../../../ui/secret/secret-selector';
import { UserDropdown } from '../components/form-fields/user-dropdown';
import { isRegexPattern } from '../schemas';
import { TopicSelector } from '../topic-selector';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type IndexerSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  exactTopics: string[];
  regexPatterns: string[];
  redpandaPassword: string;
  availableSecrets: Array<{ id: string; name: string }>;
  onExactTopicsChange: (topics: string[]) => void;
  onRegexPatternsChange: (patterns: string[]) => void;
  onRedpandaPasswordChange: (secretId: string) => void;
};

/**
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/**
 * Extracts the secret name from the template string format: ${secrets.SECRET_NAME} -> SECRET_NAME
 */
const extractSecretName = (secretTemplate: string): string => {
  if (!secretTemplate) {
    return '';
  }
  const match = secretTemplate.match(SECRET_TEMPLATE_REGEX);
  return match ? match[1] : secretTemplate; // Return original if no match (in case it's already just the ID)
};

export const IndexerSection = ({
  knowledgeBase,
  isEditMode,
  exactTopics,
  regexPatterns,
  redpandaPassword,
  availableSecrets,
  onExactTopicsChange,
  onRegexPatternsChange,
  onRedpandaPasswordChange,
}: IndexerSectionProps) => {
  const { control } = useFormContext<KnowledgeBaseUpdateForm>();

  const indexer = knowledgeBase.indexer;

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <TableOfContents className="h-4 w-4" />
          <Text className="font-semibold">Indexer</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-4">
          {isEditMode ? (
            <>
              <div className="flex gap-4">
                <FormField
                  control={control}
                  name="indexer.chunkSize"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel required>Chunk Size</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          min={1}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          type="number"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="indexer.chunkOverlap"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel required>Chunk Overlap</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          min={0}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          type="number"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormItem>
                <FormLabel>Exact Topics</FormLabel>
                <Text className="mb-2 text-muted-foreground text-sm">Select specific topic names</Text>
                <TopicSelector onTopicsChange={onExactTopicsChange} selectedTopics={exactTopics} />
              </FormItem>

              <RegexPatternsField
                helperText="Match topics dynamically using regex patterns"
                label="Regex Patterns"
                onChange={onRegexPatternsChange}
                patterns={regexPatterns}
              />

              <Text className="text-muted-foreground text-xs">
                At least one exact topic OR one regex pattern must be provided.
              </Text>

              <FormField
                control={control}
                name="indexer.inputTopics"
                render={() => (
                  <FormItem>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="indexer.redpandaUsername"
                render={({ field }) => (
                  <UserDropdown
                    helperText="Select from existing Redpanda users"
                    isRequired
                    label="Redpanda Username"
                    onChange={field.onChange}
                    value={field.value || ''}
                  />
                )}
              />

              <FormItem>
                <FormLabel required>Redpanda Password</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">
                  All credentials are securely stored in your Secrets Store
                </p>
                <FormControl>
                  <SecretSelector
                    availableSecrets={availableSecrets}
                    dialogDescription="Create a new secret for your Redpanda password"
                    dialogTitle="Create Redpanda Password Secret"
                    onChange={onRedpandaPasswordChange}
                    placeholder="Enter password or select from secrets"
                    scopes={[Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER]}
                    secretNamePlaceholder="e.g., REDPANDA_PASSWORD"
                    secretValueDescription="Your Redpanda user password"
                    secretValuePattern={GENERIC_SECRET_VALUE_PATTERN}
                    secretValuePlaceholder="Enter password"
                    value={redpandaPassword}
                  />
                </FormControl>
              </FormItem>

              <FormField
                control={control}
                name="indexer.redpandaSaslMechanism"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>SASL Mechanism</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={String(field.value || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256)}>
                          SCRAM-SHA-256
                        </SelectItem>
                        <SelectItem value={String(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512)}>
                          SCRAM-SHA-512
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </>
          ) : (
            <>
              <div className="flex gap-4">
                <FormItem className="flex-1">
                  <FormLabel>Chunk Size</FormLabel>
                  <Input disabled type="number" value={indexer?.chunkSize || 512} />
                </FormItem>
                <FormItem className="flex-1">
                  <FormLabel>Chunk Overlap</FormLabel>
                  <Input disabled type="number" value={indexer?.chunkOverlap || 100} />
                </FormItem>
              </div>

              {(() => {
                const allTopics = indexer?.inputTopics || [];
                const exact = allTopics.filter((t) => !isRegexPattern(t));
                const regex = allTopics.filter((t) => isRegexPattern(t));

                return (
                  <>
                    {exact.length > 0 && (
                      <FormItem>
                        <FormLabel>Exact Topics</FormLabel>
                        <TopicSelector
                          isReadOnly={true}
                          onTopicsChange={() => {
                            // Read-only field, no action needed
                          }}
                          selectedTopics={exact}
                        />
                      </FormItem>
                    )}

                    {regex.length > 0 && (
                      <RegexPatternsField
                        helperText="Patterns matching topics dynamically"
                        isReadOnly={true}
                        label="Regex Patterns"
                        onChange={() => {
                          // Read-only field, no action needed
                        }}
                        patterns={regex}
                      />
                    )}
                  </>
                );
              })()}

              <UserDropdown
                helperText="Select from existing Redpanda users"
                isDisabled
                isRequired
                label="Redpanda Username"
                onChange={() => {
                  // Read-only field, no action needed
                }}
                value={indexer?.redpandaUsername || ''}
              />

              <div className="space-y-2">
                <FormLabel>Redpanda Password</FormLabel>
                <p className="text-muted-foreground text-sm">
                  All credentials are securely stored in your Secrets Store
                </p>
                <Input disabled value={extractSecretName(indexer?.redpandaPassword || '') || 'Not configured'} />
              </div>

              <FormItem>
                <FormLabel>SASL Mechanism</FormLabel>
                <Input
                  disabled
                  value={
                    indexer?.redpandaSaslMechanism === SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512
                      ? 'SCRAM-SHA-512'
                      : 'SCRAM-SHA-256'
                  }
                />
              </FormItem>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
