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

import { Button } from 'components/redpanda-ui/components/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { SecretSelector, type SecretSelectorCustomText } from 'components/ui/secret/secret-selector';
import { isEmbedded } from 'config';
import { Pencil, Trash2 } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useMemo, useState } from 'react';
import type { Control, FieldErrors } from 'react-hook-form';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';

import { CertificateDialog, type CertificateType } from './certificate-dialog';
import { Text } from '../../../../redpanda-ui/components/typography';
import type { FormValues } from '../model';

// Regex to extract secret ID from ${secrets.SECRET_NAME} format
const SECRET_REFERENCE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/** Custom text for mTLS client key secret */
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

type CertificateButtonProps = {
  certType: CertificateType;
  cert: { filePath?: string; pemContent?: string; fileName?: string } | undefined;
  onOpenDialog: (certType: CertificateType) => void;
  onRemove: (certType: CertificateType) => void;
};

function CertificateButton({ certType, cert, onOpenDialog, onRemove }: CertificateButtonProps) {
  const label = CERTIFICATE_LABELS[certType] ?? 'Certificate';
  const hasCert = Boolean(cert?.filePath || cert?.pemContent);

  if (!hasCert) {
    return (
      <Button onClick={() => onOpenDialog(certType)} testId={`add-${certType}-button`} type="button" variant="outline">
        Add {label}
      </Button>
    );
  }

  const displayValue = cert?.fileName || cert?.filePath || 'Certificate added';

  return (
    <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3" data-testid={`${certType}-status`}>
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="font-medium text-sm">{displayValue}</span>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => onOpenDialog(certType)}
          size="sm"
          testId={`edit-${certType}-button`}
          type="button"
          variant="ghost"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button
          className="text-destructive hover:text-destructive"
          onClick={() => onRemove(certType)}
          size="sm"
          testId={`remove-${certType}-button`}
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

type CertificateInputFieldProps = {
  certType: CertificateType;
  control: Control<FormValues>;
  cert: { filePath?: string; pemContent?: string; fileName?: string } | undefined;
};

function CertificateInputField({ certType, control, cert }: CertificateInputFieldProps) {
  const label = CERTIFICATE_LABELS[certType] ?? 'Certificate';
  const placeholder = CERTIFICATE_PLACEHOLDERS[certType] ?? '/path/to/certificate';
  const testIdSuffix = CERTIFICATE_TEST_ID_SUFFIXES[certType] ?? 'client-key';

  return (
    <FormField
      control={control}
      name={`mtls.${certType}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label} path</FormLabel>
          <FormControl>
            <Input
              onChange={(e) => {
                const value = e.target.value.trim();
                field.onChange(value ? { filePath: value } : undefined);
              }}
              placeholder={placeholder}
              testId={`mtls-${testIdSuffix}-path-input`}
              type="text"
              value={cert?.filePath || ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type MtlsCertificatesUploadProps = {
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
  certs: {
    ca: { filePath?: string; pemContent?: string; fileName?: string } | undefined;
    clientCert: { filePath?: string; pemContent?: string; fileName?: string } | undefined;
    clientKey: { filePath?: string; pemContent?: string; fileName?: string } | undefined;
  };
  onOpenDialog: (certType: CertificateType) => void;
  onRemove: (certType: CertificateType) => void;
  hideClientKey?: boolean;
};

const MtlsCertificatesUpload = ({
  control,
  errors,
  certs,
  onOpenDialog,
  onRemove,
  hideClientKey,
}: MtlsCertificatesUploadProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-4">
      <FormField
        control={control}
        name="mtls.ca"
        render={() => (
          <FormItem className="w-1/2">
            <CertificateButton cert={certs.ca} certType="ca" onOpenDialog={onOpenDialog} onRemove={onRemove} />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="mtls.clientCert"
        render={() => (
          <FormItem className="w-1/2">
            <CertificateButton
              cert={certs.clientCert}
              certType="clientCert"
              onOpenDialog={onOpenDialog}
              onRemove={onRemove}
            />
          </FormItem>
        )}
      />

      {!hideClientKey && (
        <FormField
          control={control}
          name="mtls.clientKey"
          render={() => (
            <FormItem className="w-1/2">
              <CertificateButton
                cert={certs.clientKey}
                certType="clientKey"
                onOpenDialog={onOpenDialog}
                onRemove={onRemove}
              />
            </FormItem>
          )}
        />
      )}
    </div>

    {Boolean(errors.mtls?.ca || errors.mtls?.clientCert || errors.mtls?.clientKey) && (
      <div className="flex flex-col gap-1" data-testid="mtls-certificates-errors">
        {Boolean(errors.mtls?.ca?.message) && (
          <Text className="text-destructive text-sm">{String(errors.mtls?.ca?.message)}</Text>
        )}
        {Boolean(errors.mtls?.clientCert?.message) && (
          <Text className="text-destructive text-sm">{String(errors.mtls?.clientCert?.message)}</Text>
        )}
        {Boolean(errors.mtls?.clientKey?.message) && (
          <Text className="text-destructive text-sm">{String(errors.mtls?.clientKey?.message)}</Text>
        )}
      </div>
    )}
  </div>
);

export const MtlsConfiguration = () => {
  const { control, setValue } = useFormContext<FormValues>();
  const { errors } = useFormState({ control });
  const useTls = useWatch({ control, name: 'useTls' });
  const mtlsMode = useWatch({ control, name: 'mtlsMode' });
  const mtls = useWatch({ control, name: 'mtls' });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentCertType, setCurrentCertType] = useState<CertificateType>('ca');

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
  const extractSecretId = (pemContent: string | undefined): string => {
    if (!pemContent) {
      return '';
    }
    const match = pemContent.match(SECRET_REFERENCE_REGEX);
    return match?.[1] || '';
  };

  // Don't render if TLS is disabled
  if (!useTls) {
    return null;
  }

  const handleOpenDialog = (certType: CertificateType) => {
    setCurrentCertType(certType);
    setIsDialogOpen(true);
  };

  const handleSaveCertificate = (value: { filePath?: string; pemContent?: string; fileName?: string }) => {
    setValue(`mtls.${currentCertType}`, value);
  };

  const handleRemoveCertificate = (certType: CertificateType) => {
    setValue(`mtls.${certType}`, undefined);
  };

  const getCertificateValue = (certType: CertificateType) => mtls?.[certType];

  const certs = {
    ca: getCertificateValue('ca'),
    clientCert: getCertificateValue('clientCert'),
    clientKey: getCertificateValue('clientKey'),
  };

  return (
    <>
      <div className="flex flex-col gap-4" data-testid="mtls-certificates-form">
        <Text variant="muted">
          Configure certificates for mutual TLS authentication. Upload embeds certificate content in the configuration,
          while file path references certificates already on the broker. Providing certificates enables mTLS; leaving
          them empty uses server-side TLS only.
        </Text>

        {!isEmbedded() && (
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
                      // Clear all certificates when mode changes
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
        )}

        {!isEmbedded() && mtlsMode === 'file_path' ? (
          <div className="flex flex-col gap-4">
            <CertificateInputField cert={certs.ca} certType="ca" control={control} />
            <CertificateInputField cert={certs.clientCert} certType="clientCert" control={control} />
            <CertificateInputField cert={certs.clientKey} certType="clientKey" control={control} />
          </div>
        ) : (
          <>
            <MtlsCertificatesUpload
              certs={certs}
              control={control}
              errors={errors}
              hideClientKey={isEmbedded()}
              onOpenDialog={handleOpenDialog}
              onRemove={handleRemoveCertificate}
            />
            {isEmbedded() && (
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
                          // Store the complete secret reference structure: ${secrets.<NAME>}
                          field.onChange(secretId ? { pemContent: `\${secrets.${secretId}}` } : undefined);
                        }}
                        placeholder="Select or create client key secret"
                        scopes={[Scope.REDPANDA_CLUSTER]}
                        value={extractSecretId(mtls?.clientKey?.pemContent)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        )}
      </div>

      <CertificateDialog
        certificateType={currentCertType}
        existingValue={getCertificateValue(currentCertType)}
        isOpen={isDialogOpen}
        mode={mtlsMode}
        onOpenChange={setIsDialogOpen}
        onSave={handleSaveCertificate}
      />
    </>
  );
};
