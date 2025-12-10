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

import { Card, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { SecretSelector, type SecretSelectorCustomText } from 'components/ui/secret/secret-selector';
import { isEmbedded } from 'config';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useEffect, useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';

import type { FormValues } from '../model';

// Regex to extract secret ID from ${secrets.SECRET_NAME} format
const SECRET_REFERENCE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/** Custom text for SCRAM password secret */
const SCRAM_PASSWORD_SECRET_TEXT: SecretSelectorCustomText = {
  dialogDescription: 'Create a new secret for your SCRAM authentication password. The secret will be stored securely.',
  secretNamePlaceholder: 'e.g., SCRAM_PASSWORD',
  secretValuePlaceholder: 'Enter password...',
  secretValueDescription: 'Your SCRAM authentication password',
  emptyStateDescription: 'Create a secret to securely store your SCRAM password',
};

export const ScramConfiguration = () => {
  const { control, setValue, getValues } = useFormContext<FormValues>();
  const useScram = useWatch({ control, name: 'useScram' });
  const scramCredentials = useWatch({ control, name: 'scramCredentials' });

  // Fetch secrets for SecretSelector (embedded mode only)
  const { data: secretsData } = useListSecretsQuery({}, { enabled: isEmbedded() });
  const availableSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets
      .filter((secret): secret is NonNullable<typeof secret> & { id: string } => !!secret?.id)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      }));
  }, [secretsData]);

  // Helper to extract secret ID from ${secrets.SECRET_NAME} format
  const extractSecretId = (password: string | undefined): string => {
    if (!password) {
      return '';
    }
    const match = password.match(SECRET_REFERENCE_REGEX);
    return match?.[1] || '';
  };

  useEffect(() => {
    if (useScram) {
      // Only set default values if no existing credentials
      const existingCredentials = getValues('scramCredentials');
      if (!(existingCredentials?.username || existingCredentials?.password)) {
        setValue('scramCredentials', {
          username: '',
          password: '',
          mechanism: existingCredentials?.mechanism ?? ScramMechanism.SCRAM_SHA_256,
        });
      }
    } else {
      setValue('scramCredentials', undefined);
    }
  }, [useScram, setValue, getValues]);

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
      </CardHeader>
      <FormField
        control={control}
        name="useScram"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-3">
            <FormLabel>Use SCRAM authentication</FormLabel>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} testId="scram-toggle" />
            </FormControl>
          </FormItem>
        )}
      />

      {useScram && (
        <div className="space-y-4" data-testid="scram-credentials-form">
          <FormField
            control={control}
            name="scramCredentials.username"
            render={({ field }) => (
              <FormItem data-testid="scram-username-field">
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} testId="scram-username-input" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="scramCredentials.password"
            render={({ field }) => (
              <FormItem data-testid="scram-password-field">
                <FormLabel>Password</FormLabel>
                <FormControl>
                  {isEmbedded() ? (
                    <SecretSelector
                      availableSecrets={availableSecrets}
                      customText={SCRAM_PASSWORD_SECRET_TEXT}
                      onChange={(secretId) => {
                        // Store the complete secret reference structure: ${secrets.<NAME>}
                        field.onChange(secretId ? `\${secrets.${secretId}}` : '');
                      }}
                      placeholder="Select or create password secret"
                      scopes={[Scope.REDPANDA_CLUSTER]}
                      value={extractSecretId(scramCredentials?.password)}
                    />
                  ) : (
                    <Input {...field} testId="scram-password-input" type="password" />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="scramCredentials.mechanism"
            render={({ field }) => (
              <FormItem data-testid="scram-mechanism-field">
                <FormLabel>SASL mechanism</FormLabel>
                <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mechanism" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={String(ScramMechanism.SCRAM_SHA_256)}>SCRAM-SHA-256</SelectItem>
                    <SelectItem value={String(ScramMechanism.SCRAM_SHA_512)}>SCRAM-SHA-512</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </Card>
  );
};
