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

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { SecretSelector, type SecretSelectorCustomText } from 'components/ui/secret/secret-selector';
import { isEmbedded } from 'config';
import { Trash2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useCallback, useMemo, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';

import { extractSecretId, toSecretReference } from './secret-reference';
import { CertificateUploadRow, ConfiguredBadge } from '../certificate-upload';
import { DisclosureRow } from '../disclosure-row';
import type { FormValues } from '../model';

export type CertificateType = 'ca' | 'clientCert' | 'clientKey';

const MTLS_CLIENT_KEY_SECRET_TEXT: SecretSelectorCustomText = {
  dialogDescription: 'Create a new secret for your mTLS client private key. The secret will be stored securely.',
  secretNamePlaceholder: 'e.g., MTLS_CLIENT_KEY',
  secretValuePlaceholder: 'Paste PEM-encoded private key...',
  secretValueDescription: 'Your mTLS client private key (PEM format)',
  emptyStateDescription: 'Create a secret to securely store your mTLS client private key',
};

const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  ca: 'CA certificate',
  clientCert: 'Client certificate',
  clientKey: 'Client private key',
};

const CERTIFICATE_PLACEHOLDERS: Record<CertificateType, string> = {
  ca: '/etc/redpanda/certs/ca.crt',
  clientCert: '/etc/redpanda/certs/client.crt',
  clientKey: '/etc/redpanda/certs/client.key',
};

const CERTIFICATE_TEST_ID_SUFFIXES: Record<CertificateType, string> = {
  ca: 'ca',
  clientCert: 'client-cert',
  clientKey: 'client-key',
};

type Cert = NonNullable<FormValues['mtls']>['ca'];

const hasCertValue = (cert: Cert): boolean => Boolean(cert?.filePath || cert?.pemContent);

// ---------------------------------------------------------------------------
// Inline cert dropzone (PEM upload — replaces the old modal-based flow).
// Self-contained: reads/writes form state directly via useFormContext.
// ---------------------------------------------------------------------------

function CertificateDropzone({ certType }: { certType: CertificateType }) {
  const { control, setValue } = useFormContext<FormValues>();
  const cert = useWatch({ control, name: `mtls.${certType}` });
  const label = CERTIFICATE_LABELS[certType];
  const hasCert = hasCertValue(cert);
  const fileName = cert?.fileName ?? cert?.filePath;

  const handleDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string | undefined) ?? '';
        setValue(`mtls.${certType}`, { pemContent: content, fileName: file.name });
      };
      reader.readAsText(file);
    },
    [certType, setValue]
  );

  const handleRemove = useCallback(() => {
    setValue(`mtls.${certType}`, undefined);
  }, [certType, setValue]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-body font-medium">{label}</span>
        <span className="text-body-sm text-muted-foreground">· optional</span>
      </div>
      <div className="relative">
        <CertificateUploadRow
          fileName={fileName || undefined}
          onDrop={handleDrop}
          testId={hasCert ? `${certType}-status` : `add-${certType}-button`}
        />
        {hasCert && (
          <button
            aria-label={`Remove ${label}`}
            className="absolute top-1/2 right-2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid={`remove-${certType}-button`}
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File-path input (alternative cert input mode for non-embedded users).
// ---------------------------------------------------------------------------

function CertificateInputField({ certType }: { certType: CertificateType }) {
  const { control } = useFormContext<FormValues>();
  const label = CERTIFICATE_LABELS[certType];
  const placeholder = CERTIFICATE_PLACEHOLDERS[certType];
  const testIdSuffix = CERTIFICATE_TEST_ID_SUFFIXES[certType];

  return (
    <FormField
      control={control}
      name={`mtls.${certType}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            <span className="flex items-baseline gap-1.5">
              <span className="text-body font-medium">{label} path</span>
              <span className="text-body-sm text-muted-foreground">· optional</span>
            </span>
          </FormLabel>
          <FormControl>
            <Input
              onChange={(e) => {
                const value = e.target.value.trim();
                field.onChange(value ? { filePath: value } : undefined);
              }}
              placeholder={placeholder}
              testId={`mtls-${testIdSuffix}-path-input`}
              type="text"
              value={field.value?.filePath || ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Embedded-mode client-key picker (lives in Cloud Secrets, not as a file).
// ---------------------------------------------------------------------------

function ClientKeySecretField() {
  const { control } = useFormContext<FormValues>();

  const { data: secretsData } = useListSecretsQuery({}, { enabled: isEmbedded() });
  const availableSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets
      .filter((secret): secret is NonNullable<typeof secret> & { id: string } => Boolean(secret?.id))
      .map((secret) => ({ id: secret.id, name: secret.id }));
  }, [secretsData]);

  return (
    <FormField
      control={control}
      name="mtls.clientKey"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Client private key secret</FormLabel>
          <FormControl>
            <SecretSelector
              availableSecrets={availableSecrets}
              customText={MTLS_CLIENT_KEY_SECRET_TEXT}
              onChange={(secretId) => {
                field.onChange(secretId ? { pemContent: toSecretReference(secretId) } : undefined);
              }}
              placeholder="Select or create client key secret"
              scopes={[Scope.REDPANDA_CLUSTER]}
              value={extractSecretId(field.value?.pemContent)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-fields per disclosure
// ---------------------------------------------------------------------------

/** File-path inputs replace the uploads when a self-managed user picks the "File path" method. */
function useCertificateFilePaths() {
  const { control } = useFormContext<FormValues>();
  const mtlsMode = useWatch({ control, name: 'mtlsMode' });
  return !isEmbedded() && mtlsMode === 'file_path';
}

function CaCertField() {
  const useFilePath = useCertificateFilePaths();
  return useFilePath ? <CertificateInputField certType="ca" /> : <CertificateDropzone certType="ca" />;
}

function MtlsCertFields() {
  const useFilePath = useCertificateFilePaths();
  if (useFilePath) {
    return (
      <>
        <CertificateInputField certType="clientKey" />
        <CertificateInputField certType="clientCert" />
      </>
    );
  }
  return (
    <>
      {isEmbedded() ? <ClientKeySecretField /> : <CertificateDropzone certType="clientKey" />}
      <CertificateDropzone certType="clientCert" />
    </>
  );
}

function MtlsErrors() {
  const { control } = useFormContext<FormValues>();
  const { errors } = useFormState({ control });
  const messages = (['ca', 'clientCert', 'clientKey'] as const)
    .map((key) => errors.mtls?.[key]?.message)
    .filter((msg): msg is string => Boolean(msg));

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1" data-testid="mtls-certificates-errors">
      {messages.map((msg) => (
        <div className="text-body text-destructive" key={msg}>
          {msg}
        </div>
      ))}
    </div>
  );
}

function CertificateInputMethodField() {
  const { control, setValue } = useFormContext<FormValues>();

  return (
    <FormField
      control={control}
      name="mtlsMode"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>Certificate input method</FormLabel>
          <FormControl>
            <Tabs
              onValueChange={(value) => {
                field.onChange(value);
                // Switching modes invalidates any partially-entered cert values
                // because file_path and pem use different storage shapes.
                setValue('mtls.ca', undefined);
                setValue('mtls.clientCert', undefined);
                setValue('mtls.clientKey', undefined);
              }}
              value={field.value}
            >
              <TabsList>
                <TabsTrigger data-testid="mtls-mode-upload-tab" value="pem">
                  Upload
                </TabsTrigger>
                <TabsTrigger data-testid="mtls-mode-file-path-tab" value="file_path">
                  File path
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export const MtlsConfiguration = () => {
  const { control } = useFormContext<FormValues>();
  const [useTls, mtls] = useWatch({ control, name: ['useTls', 'mtls'] });

  const hasCa = hasCertValue(mtls?.ca);
  const hasClientCert = hasCertValue(mtls?.clientCert);
  const hasClientKey = hasCertValue(mtls?.clientKey);

  // Snapshot form state at mount for initial open state. Once mounted, the user
  // controls open/close — values arriving later won't re-open the row.
  const [caOpen, setCaOpen] = useState(hasCa);
  const [mtlsOpen, setMtlsOpen] = useState(hasClientCert || hasClientKey);

  if (!useTls) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="mtls-certificates-form">
      {!isEmbedded() && (caOpen || mtlsOpen) && <CertificateInputMethodField />}

      <DisclosureRow
        badge={hasCa ? <ConfiguredBadge /> : null}
        description="For self-signed certificates or a private CA on the source cluster."
        label="Use a custom CA certificate"
        onOpenChange={setCaOpen}
        open={caOpen}
        testId="tls-ca-disclosure"
        triggerTestId="tls-ca-disclosure-trigger"
      >
        <CaCertField />
      </DisclosureRow>

      <DisclosureRow
        badge={hasClientCert && hasClientKey ? <ConfiguredBadge /> : null}
        description="Authenticate the shadow cluster to the source cluster with a client certificate."
        label="Use mutual TLS (mTLS)"
        onOpenChange={setMtlsOpen}
        open={mtlsOpen}
        testId="tls-mtls-disclosure"
        triggerTestId="tls-mtls-disclosure-trigger"
      >
        <div className="flex flex-col gap-4">
          <MtlsCertFields />
          <div className="text-body-sm text-muted-foreground" data-testid="tls-mtls-pair-hint">
            Client certificate and private key must be provided together.
          </div>
          <MtlsErrors />
        </div>
      </DisclosureRow>
    </div>
  );
};
