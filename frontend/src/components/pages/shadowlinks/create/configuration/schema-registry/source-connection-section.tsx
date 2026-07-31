/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { SecretSelector, type SecretSelectorCustomText } from 'components/ui/secret/secret-selector';
import { isEmbedded } from 'config';
import { InfoIcon } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';

import { SrTlsConfiguration } from './sr-tls-configuration';
import { extractSecretId, toSecretReference } from '../../connection/secret-reference';
import { type FormValues, SR_AUTH_METHOD } from '../../model';

const SR_PASSWORD_SECRET_TEXT: SecretSelectorCustomText = {
  dialogDescription:
    'Create a new secret for your Schema Registry HTTP Basic password. The secret will be stored securely.',
  secretNamePlaceholder: 'e.g., SCHEMA_REGISTRY_PASSWORD',
  secretValuePlaceholder: 'Enter password...',
  secretValueDescription: 'Your Schema Registry HTTP Basic password',
  emptyStateDescription: 'Create a secret to securely store your Schema Registry password',
};

const InfoTooltip = ({ content }: { content: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger aria-label={content} className="inline-flex cursor-help items-center">
        <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{content}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export const SourceConnectionSection = () => {
  const { control, setValue } = useFormContext<FormValues>();
  const authMethod = useWatch({ control, name: 'schemaRegistry.authMethod' });

  // Fetch secrets for SecretSelector (embedded mode only)
  const { data: secretsData } = useListSecretsQuery({}, { enabled: isEmbedded() });
  const availableSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets
      .filter((secret): secret is NonNullable<typeof secret> & { id: string } => Boolean(secret?.id))
      .map((secret) => ({ id: secret.id, name: secret.id }));
  }, [secretsData]);

  const handleAuthMethodChange = (next: string) => {
    if (next !== SR_AUTH_METHOD.NONE && next !== SR_AUTH_METHOD.BASIC) {
      return;
    }
    setValue('schemaRegistry.authMethod', next, { shouldValidate: true });
  };

  return (
    <div className="space-y-4" data-testid="sr-source-connection-section">
      <div className="text-label">Source connection</div>

      <FormField
        control={control}
        name="schemaRegistry.sourceUrl"
        render={({ field }) => (
          <FormItem data-testid="sr-source-url-field">
            <FormLabel required>Source URL</FormLabel>
            <FormControl>
              <Input {...field} placeholder="https://schema-registry.example.com:8081" testId="sr-source-url-input" />
            </FormControl>
            <FormDescription>The source Schema Registry URL.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex flex-col gap-2">
        <div className="text-label">Authentication</div>
        <Tabs onValueChange={handleAuthMethodChange} value={authMethod}>
          <TabsList>
            <TabsTrigger testId="sr-auth-none-tab" value={SR_AUTH_METHOD.NONE}>
              None
            </TabsTrigger>
            <TabsTrigger testId="sr-auth-basic-tab" value={SR_AUTH_METHOD.BASIC}>
              HTTP Basic
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {authMethod === SR_AUTH_METHOD.NONE && (
          <div className="text-body-sm text-muted-foreground" data-testid="sr-auth-none-description">
            Requests are sent to the source Schema Registry without authentication.
          </div>
        )}
      </div>

      {authMethod === SR_AUTH_METHOD.BASIC && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2" data-testid="sr-basic-auth-fields">
          <FormField
            control={control}
            name="schemaRegistry.basicCredentials.username"
            render={({ field }) => (
              <FormItem data-testid="sr-basic-username-field">
                <FormLabel required>
                  Username
                  <InfoTooltip content="For Confluent Cloud, this is the API key." />
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="sr-replicator" testId="sr-basic-username-input" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="schemaRegistry.basicCredentials.password"
            render={({ field }) => (
              <FormItem data-testid="sr-basic-password-field">
                <FormLabel required>
                  Password
                  <InfoTooltip content="For Confluent Cloud, this is the API secret." />
                </FormLabel>
                <FormControl>
                  {isEmbedded() ? (
                    <SecretSelector
                      availableSecrets={availableSecrets}
                      customText={SR_PASSWORD_SECRET_TEXT}
                      minValueLength={1}
                      onChange={(secretId) => {
                        field.onChange(secretId ? toSecretReference(secretId) : '');
                      }}
                      placeholder="Select or create password secret"
                      scopes={[Scope.REDPANDA_CLUSTER]}
                      value={extractSecretId(field.value)}
                    />
                  ) : (
                    <Input {...field} testId="sr-basic-password-input" type="password" />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      <SrTlsConfiguration />
    </div>
  );
};
