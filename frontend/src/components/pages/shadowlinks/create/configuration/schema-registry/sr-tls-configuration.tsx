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

import { Button } from 'components/redpanda-ui/components/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Switch } from 'components/redpanda-ui/components/switch';
import { SecretSelector, type SecretSelectorCustomText } from 'components/ui/secret/secret-selector';
import { isEmbedded } from 'config';
import { Trash2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useCallback, useMemo, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';
import { toast } from 'sonner';
import { docsLinks } from 'utils/docs-links';

import { CertificateUploadRow, ConfiguredBadge, UploadedFileName } from '../../certificate-upload';
import { extractSecretId, toSecretReference } from '../../connection/secret-reference';
import { DisclosureRow } from '../../disclosure-row';
import { type FormValues, hasSrCertificate, hasSrClientKeyMaterial, type SchemaRegistryFormValues } from '../../model';

const TLS_DOCS_URL = docsLinks.selfManaged.shadowingNetworkSetup;

type SrCertificateType = 'ca' | 'clientCert' | 'clientKey';

const SR_CLIENT_KEY_SECRET_TEXT: SecretSelectorCustomText = {
  dialogDescription:
    'Create a new secret for your Schema Registry mTLS client private key. The secret will be stored securely.',
  secretNamePlaceholder: 'e.g., SR_MTLS_CLIENT_KEY',
  secretValuePlaceholder: 'Paste PEM-encoded private key...',
  secretValueDescription: 'Your Schema Registry mTLS client private key (PEM format)',
  emptyStateDescription: 'Create a secret to securely store your Schema Registry mTLS client private key',
};

const CERTIFICATE_LABELS: Record<SrCertificateType, string> = {
  ca: 'CA certificate',
  clientCert: 'Client certificate',
  clientKey: 'Client private key',
};

// The client cert/key pair error lives on the sibling field, so uploads and
// removals refresh the other side too.
const CERTIFICATE_PAIR_SIBLING: Partial<Record<SrCertificateType, SrCertificateType>> = {
  clientCert: 'clientKey',
  clientKey: 'clientCert',
};

// trigger() runs detached from these handlers and rejects only if the resolver
// itself throws; report that instead of dropping it.
const reportRevalidationError = (error: unknown) => {
  toast.error('Failed to validate the form', { description: String(error) });
};

/**
 * Trash affordance overlaid on the top-right corner of a dropzone or
 * configured-material row. Stops propagation so the click never reaches the
 * dropzone's file picker underneath.
 */
const RemoveMaterialButton = ({ label, onRemove, testId }: { label: string; onRemove: () => void; testId: string }) => (
  <Button
    aria-label={label}
    className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
    onClick={(e) => {
      e.stopPropagation();
      onRemove();
    }}
    size="icon-xs"
    testId={testId}
    type="button"
    variant="ghost"
  >
    <Trash2 />
  </Button>
);

/**
 * Duplicated from connection/mtls-configuration.tsx rather than parameterized:
 * that component hardwires the connection step's 'mtls.*' field paths, its
 * file-path input mode, and the embedded secret-selector flow, none of which
 * apply here — the Schema Registry section is PEM uploads only.
 */
function SrCertificateDropzone({ certType, optional }: { certType: SrCertificateType; optional?: boolean }) {
  const { control, setValue, trigger } = useFormContext<FormValues>();
  const cert = useWatch({ control, name: `schemaRegistry.mtls.${certType}` });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const label = CERTIFICATE_LABELS[certType];
  const hasCert = hasSrCertificate(cert);
  // PEMs hydrated from the API carry no file name; show a generic label.
  const fileName = hasCert ? cert?.fileName || 'Configured certificate' : undefined;

  const handleDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string | undefined) ?? '';
        if (!content.trim()) {
          setUploadError(`${file.name} is empty. Upload a PEM-encoded ${label.toLowerCase()}.`);
          return;
        }
        setUploadError(null);
        setValue(
          `schemaRegistry.mtls.${certType}`,
          { pemContent: content, fileName: file.name },
          { shouldValidate: true, shouldDirty: true }
        );
        const sibling = CERTIFICATE_PAIR_SIBLING[certType];
        if (sibling) {
          trigger(`schemaRegistry.mtls.${sibling}`).catch(reportRevalidationError);
        }
      };
      reader.onerror = () => {
        setUploadError(`Could not read ${file.name}. Try again or choose a different file.`);
      };
      reader.readAsText(file);
    },
    [certType, label, setValue, trigger]
  );

  const handleUploadError = useCallback((error: Error) => {
    setUploadError(error.message || 'File was not accepted.');
  }, []);

  const handleRemove = useCallback(() => {
    setUploadError(null);
    setValue(`schemaRegistry.mtls.${certType}`, undefined, { shouldValidate: true, shouldDirty: true });
    const sibling = CERTIFICATE_PAIR_SIBLING[certType];
    if (sibling) {
      trigger(`schemaRegistry.mtls.${sibling}`).catch(reportRevalidationError);
    }
  }, [certType, setValue, trigger]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-body font-medium">{label}</span>
        {optional && <span className="text-body-sm text-muted-foreground">· optional</span>}
      </div>
      <div className="relative">
        <CertificateUploadRow
          fileName={fileName}
          onDrop={handleDrop}
          onError={handleUploadError}
          testId={hasCert ? `sr-${certType}-status` : `add-sr-${certType}-button`}
        />
        {hasCert && (
          <RemoveMaterialButton
            label={`Remove ${label}`}
            onRemove={handleRemove}
            testId={`remove-sr-${certType}-button`}
          />
        )}
      </div>
      {uploadError && (
        <div className="text-body text-destructive" data-testid={`sr-${certType}-upload-error`}>
          {uploadError}
        </div>
      )}
    </div>
  );
}

const SrCaConfiguredBadge = () => {
  const { control } = useFormContext<FormValues>();
  const ca = useWatch({ control, name: 'schemaRegistry.mtls.ca' });
  return hasSrCertificate(ca) ? <ConfiguredBadge /> : null;
};

const SrMtlsConfiguredBadge = () => {
  const { control } = useFormContext<FormValues>();
  const [clientCert, clientKey, existingKeyConfigured] = useWatch({
    control,
    name: [
      'schemaRegistry.mtls.clientCert',
      'schemaRegistry.mtls.clientKey',
      'schemaRegistry.mtls.existingKeyConfigured',
    ],
  });
  const hasKeyMaterial = hasSrCertificate(clientKey) || existingKeyConfigured;
  return hasSrCertificate(clientCert) && hasKeyMaterial ? <ConfiguredBadge /> : null;
};

/**
 * Shown in place of the key dropzone when the stored key exists only
 * server-side (the API never returns it). Removing it reveals the dropzone;
 * an empty key in the update request keeps the stored one.
 */
const ExistingKeyRow = () => {
  const { control, setValue, trigger } = useFormContext<FormValues>();
  const fingerprint = useWatch({ control, name: 'schemaRegistry.mtls.existingKeyFingerprint' });

  const handleRemove = () => {
    setValue('schemaRegistry.mtls.existingKeyConfigured', false, { shouldDirty: true });
    setValue('schemaRegistry.mtls.existingKeyFingerprint', '', { shouldDirty: true });
    // The pair error for a now-keyless cert lands on the clientKey field.
    trigger(['schemaRegistry.mtls.clientKey', 'schemaRegistry.mtls.clientCert']).catch(reportRevalidationError);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body font-medium">{CERTIFICATE_LABELS.clientKey}</span>
      <div className="relative">
        <div
          className="flex items-center gap-2.5 rounded-lg border bg-primary/5 p-2 text-body"
          data-testid="sr-clientKey-existing-status"
        >
          <UploadedFileName>Configured</UploadedFileName>
        </div>
        <RemoveMaterialButton
          label="Remove client private key"
          onRemove={handleRemove}
          testId="remove-sr-existing-key-button"
        />
      </div>
      {fingerprint && (
        <div
          className="truncate font-mono text-body-sm text-muted-foreground"
          data-testid="sr-existing-key-fingerprint"
        >
          SHA-256: {fingerprint}
        </div>
      )}
    </div>
  );
};

/**
 * Embedded-mode client-key picker (lives in Cloud Secrets, not as a file).
 * Mirrors ClientKeySecretField in connection/mtls-configuration.tsx: the
 * secret reference is stored in the pemContent slot and sent verbatim.
 */
const SrClientKeySecretField = () => {
  const { control, trigger } = useFormContext<FormValues>();

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
      name="schemaRegistry.mtls.clientKey"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Client private key secret</FormLabel>
          <FormControl>
            <SecretSelector
              availableSecrets={availableSecrets}
              customText={SR_CLIENT_KEY_SECRET_TEXT}
              onChange={(secretId) => {
                field.onChange(secretId ? { pemContent: toSecretReference(secretId), fileName: '' } : undefined);
                // The cert/key pair error lives on the sibling field too.
                trigger(['schemaRegistry.mtls.clientKey', 'schemaRegistry.mtls.clientCert']).catch(
                  reportRevalidationError
                );
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
};

const SrClientKeyField = () => {
  const { control } = useFormContext<FormValues>();
  const [clientKey, existingKeyConfigured] = useWatch({
    control,
    name: ['schemaRegistry.mtls.clientKey', 'schemaRegistry.mtls.existingKeyConfigured'],
  });
  const showExistingKey = !hasSrCertificate(clientKey) && existingKeyConfigured;

  if (showExistingKey) {
    return <ExistingKeyRow />;
  }
  return isEmbedded() ? <SrClientKeySecretField /> : <SrCertificateDropzone certType="clientKey" />;
};

/**
 * Read-only view for TLS configured as certificate file paths (e.g. via rpk):
 * Console can't edit those, only round-trip them.
 */
const SrTlsFilePathsNotice = ({
  filePaths,
}: {
  filePaths: NonNullable<SchemaRegistryFormValues['mtls']['filePaths']>;
}) => (
  <div className="rounded-md border bg-muted/30 p-4" data-testid="sr-tls-file-settings-readonly">
    <div className="text-body font-medium">TLS certificate file paths</div>
    <p className="mt-1 text-body-sm text-muted-foreground">
      TLS for this link is configured with certificate file paths (for example via rpk). Console preserves these
      settings as-is; use rpk or the Admin API to change them.
    </p>
    <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
      <span className="text-muted-foreground">CA</span>
      <span className="truncate font-mono" data-testid="sr-tls-file-ca-path">
        {filePaths.caPath || '—'}
      </span>
      <span className="text-muted-foreground">Private key</span>
      <span className="truncate font-mono" data-testid="sr-tls-file-key-path">
        {filePaths.keyPath || '—'}
      </span>
      <span className="text-muted-foreground">Certificate</span>
      <span className="truncate font-mono" data-testid="sr-tls-file-cert-path">
        {filePaths.certPath || '—'}
      </span>
    </div>
  </div>
);

export const SrTlsConfiguration = () => {
  const { control, getValues, trigger } = useFormContext<FormValues>();
  const useTls = useWatch({ control, name: 'schemaRegistry.useTls' });
  const filePaths = useWatch({ control, name: 'schemaRegistry.mtls.filePaths' });
  const { errors } = useFormState({
    control,
    name: ['schemaRegistry.mtls.clientCert', 'schemaRegistry.mtls.clientKey'],
  });
  const mtlsErrors = errors.schemaRegistry?.mtls;
  const hasMtlsError = Boolean(mtlsErrors?.clientCert || mtlsErrors?.clientKey);

  // Snapshot at mount for initial open state; afterwards the user controls
  // open/close.
  const [caOpen, setCaOpen] = useState(() => hasSrCertificate(getValues('schemaRegistry.mtls.ca')));
  const [mtlsOpen, setMtlsOpen] = useState(() => {
    const mtls = getValues('schemaRegistry.mtls');
    return hasSrCertificate(mtls.clientCert) || hasSrClientKeyMaterial(mtls);
  });

  return (
    <div className="space-y-3" data-testid="sr-tls-configuration">
      <FormField
        control={control}
        name="schemaRegistry.useTls"
        render={({ field }) => (
          <FormItem layout="horizontal">
            <FormLabel>Enable TLS</FormLabel>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  // The https-required error lives on the source URL field, so
                  // toggling TLS must refresh it or a stale error lingers.
                  trigger('schemaRegistry.sourceUrl').catch(reportRevalidationError);
                }}
                testId="sr-tls-toggle"
              />
            </FormControl>
          </FormItem>
        )}
      />

      {useTls && (
        <>
          <div className="text-body text-muted-foreground" data-testid="sr-tls-intro">
            The connection to the source Schema Registry is encrypted. By default, its certificate is verified using the
            system trust store. Upload a custom CA below if the source uses a private or self-signed CA.{' '}
            <a className="text-primary hover:underline" href={TLS_DOCS_URL} rel="noreferrer" target="_blank">
              Learn about TLS for shadow links
            </a>
          </div>

          {filePaths ? (
            <SrTlsFilePathsNotice filePaths={filePaths} />
          ) : (
            <div className="flex flex-col gap-3" data-testid="sr-mtls-certificates-form">
              <DisclosureRow
                badge={<SrCaConfiguredBadge />}
                description="For self-signed certificates or a private CA on the source Schema Registry."
                label="Use a custom CA certificate"
                onOpenChange={setCaOpen}
                open={caOpen}
                testId="sr-tls-ca-disclosure"
                triggerTestId="sr-tls-ca-disclosure-trigger"
              >
                <SrCertificateDropzone certType="ca" optional />
              </DisclosureRow>

              <DisclosureRow
                badge={<SrMtlsConfiguredBadge />}
                description="Authenticate the shadow cluster to the source Schema Registry with a client certificate."
                label="Use mutual TLS (mTLS)"
                onOpenChange={setMtlsOpen}
                // Forced open while a pair-consistency error exists: the error
                // messages render inside this panel, and a collapsed panel would
                // otherwise block the wizard with no visible feedback.
                open={mtlsOpen || hasMtlsError}
                testId="sr-tls-mtls-disclosure"
                triggerTestId="sr-tls-mtls-disclosure-trigger"
              >
                <div className="flex flex-col gap-4">
                  <FormField
                    control={control}
                    name="schemaRegistry.mtls.clientKey"
                    render={() => (
                      <FormItem>
                        <SrClientKeyField />
                        <FormMessage data-testid="sr-mtls-client-key-error" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="schemaRegistry.mtls.clientCert"
                    render={() => (
                      <FormItem>
                        <SrCertificateDropzone certType="clientCert" />
                        <FormMessage data-testid="sr-mtls-client-cert-error" />
                      </FormItem>
                    )}
                  />
                  <div className="text-body-sm text-muted-foreground" data-testid="sr-mtls-pair-hint">
                    Client certificate and private key must be provided together.
                  </div>
                </div>
              </DisclosureRow>
            </div>
          )}
        </>
      )}
    </div>
  );
};
