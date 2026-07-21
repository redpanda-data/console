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

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
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
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { SecretSelector, type SecretSelectorCustomText } from 'components/ui/secret/secret-selector';
import { isEmbedded } from 'config';
import { ExternalLink, InfoIcon } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';

import { extractSecretId, toSecretReference } from './secret-reference';
import { AUTH_METHOD, type AuthMethod, type FormValues } from '../model';

const SHADOW_LINK_DOCS_URL =
  'https://docs.redpanda.com/current/manage/disaster-recovery/shadowing/setup/#replication-service-permissions';

// Base UI's <Select.Value> can't resolve an item's label until the popup
// mounts, so an enum-backed controlled value renders as the raw string ("1")
// on first paint. Passing an `items` map closes the gap eagerly.
const SCRAM_MECHANISM_ITEMS: Record<string, string> = {
  [String(ScramMechanism.SCRAM_SHA_256)]: 'SCRAM-SHA-256',
  [String(ScramMechanism.SCRAM_SHA_512)]: 'SCRAM-SHA-512',
};

const SCRAM_PASSWORD_SECRET_TEXT: SecretSelectorCustomText = {
  dialogDescription: 'Create a new secret for your SCRAM authentication password. The secret will be stored securely.',
  secretNamePlaceholder: 'e.g., SCRAM_PASSWORD',
  secretValuePlaceholder: 'Enter password...',
  secretValueDescription: 'Your SCRAM authentication password',
  emptyStateDescription: 'Create a secret to securely store your SCRAM password',
};

const PLAIN_PASSWORD_SECRET_TEXT: SecretSelectorCustomText = {
  dialogDescription: 'Create a new secret for your PLAIN authentication password. The secret will be stored securely.',
  secretNamePlaceholder: 'e.g., PLAIN_PASSWORD',
  secretValuePlaceholder: 'Enter password...',
  secretValueDescription: 'Your PLAIN authentication password',
  emptyStateDescription: 'Create a secret to securely store your PLAIN password',
};

const AUTH_METHOD_DESCRIPTIONS: Record<AuthMethod, string> = {
  [AUTH_METHOD.NONE]: 'No SASL authentication will be used to connect to the source cluster.',
  [AUTH_METHOD.SCRAM]: 'Salted Challenge Response Authentication Mechanism. Recommended.',
  [AUTH_METHOD.PLAIN]: 'Username and password are sent unhashed. Only use over a TLS-encrypted connection.',
};

export const AuthenticationSection = () => {
  const { control, setValue, getValues } = useFormContext<FormValues>();
  const authMethod = useWatch({ control, name: 'authMethod' });
  const scramCredentials = useWatch({ control, name: 'scramCredentials' });
  const plainCredentials = useWatch({ control, name: 'plainCredentials' });

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
    if (next !== AUTH_METHOD.NONE && next !== AUTH_METHOD.SCRAM && next !== AUTH_METHOD.PLAIN) {
      return;
    }
    setValue('authMethod', next);
    if (next === AUTH_METHOD.SCRAM) {
      const existing = getValues('scramCredentials');
      if (!existing) {
        setValue('scramCredentials', {
          username: '',
          password: '',
          mechanism: ScramMechanism.SCRAM_SHA_256,
        });
      }
    }
    if (next === AUTH_METHOD.PLAIN) {
      const existing = getValues('plainCredentials');
      if (!existing) {
        setValue('plainCredentials', { username: '', password: '' });
      }
    }
  };

  const showCredentials = authMethod === AUTH_METHOD.SCRAM || authMethod === AUTH_METHOD.PLAIN;

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-2">
        <div className="text-label">Authentication method</div>
        <Tabs onValueChange={handleAuthMethodChange} value={authMethod}>
          <TabsList>
            <TabsTrigger data-testid="auth-method-none" value={AUTH_METHOD.NONE}>
              None
            </TabsTrigger>
            <TabsTrigger data-testid="auth-method-scram" value={AUTH_METHOD.SCRAM}>
              SCRAM
            </TabsTrigger>
            <TabsTrigger data-testid="auth-method-plain" value={AUTH_METHOD.PLAIN}>
              PLAIN
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-body-sm text-muted-foreground">{AUTH_METHOD_DESCRIPTIONS[authMethod]}</div>
      </div>

      {showCredentials ? (
        <div className="space-y-4" data-testid="auth-credentials-form">
          <Alert
            className="border-primary/20 bg-primary/5 text-foreground"
            data-testid="auth-source-cluster-callout"
            icon={<InfoIcon className="text-primary" />}
            variant="info"
          >
            <AlertTitle className="font-medium text-foreground">The user must exist on the source cluster.</AlertTitle>
            <AlertDescription className="!block text-muted-foreground">
              <p className="leading-relaxed">
                Provide credentials for a service account on the source cluster (the one being shadowed) with ACLs to
                manage shadow link replication.{' '}
                <a
                  className="inline-flex items-center gap-0.5 whitespace-nowrap text-primary hover:underline"
                  href={SHADOW_LINK_DOCS_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  View required ACLs
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </AlertDescription>
          </Alert>

          {authMethod === AUTH_METHOD.SCRAM && (
            <>
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
                            field.onChange(secretId ? toSecretReference(secretId) : '');
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
                    <Select
                      items={SCRAM_MECHANISM_ITEMS}
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={String(field.value)}
                    >
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
            </>
          )}

          {authMethod === AUTH_METHOD.PLAIN && (
            <>
              <FormField
                control={control}
                name="plainCredentials.username"
                render={({ field }) => (
                  <FormItem data-testid="plain-username-field">
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} testId="plain-username-input" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="plainCredentials.password"
                render={({ field }) => (
                  <FormItem data-testid="plain-password-field">
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      {isEmbedded() ? (
                        <SecretSelector
                          availableSecrets={availableSecrets}
                          customText={PLAIN_PASSWORD_SECRET_TEXT}
                          onChange={(secretId) => {
                            field.onChange(secretId ? toSecretReference(secretId) : '');
                          }}
                          placeholder="Select or create password secret"
                          scopes={[Scope.REDPANDA_CLUSTER]}
                          value={extractSecretId(plainCredentials?.password)}
                        />
                      ) : (
                        <Input {...field} testId="plain-password-input" type="password" />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
};
