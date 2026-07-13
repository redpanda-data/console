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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from 'components/redpanda-ui/components/dropzone';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Check, ChevronRight, Trash2, UploadCloud } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';

import { type FormValues, hasSrCertificate } from '../../model';

const TLS_DOCS_URL =
  'https://docs.redpanda.com/current/manage/disaster-recovery/shadowing/setup/#network-and-authentication';

type SrCertificateType = 'ca' | 'clientCert' | 'clientKey';

const CERTIFICATE_ACCEPT = {
  'application/x-pem-file': ['.pem'],
  'application/x-x509-ca-cert': ['.crt', '.cer'],
  'application/pkix-cert': ['.crt', '.cer'],
  'application/x-pkcs12': ['.key'],
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
  const fileName = hasCert ? cert?.fileName : undefined;

  // Placeholder File so DropzoneContent renders — the real PEM bytes live in
  // form state.
  const src = useMemo(() => (fileName ? [new File([], fileName)] : undefined), [fileName]);

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
          trigger(`schemaRegistry.mtls.${sibling}`);
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
      trigger(`schemaRegistry.mtls.${sibling}`);
    }
  }, [certType, setValue, trigger]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-medium text-sm">{label}</span>
        {optional && <span className="text-muted-foreground text-xs">· optional</span>}
      </div>
      <div className="relative">
        <Dropzone
          accept={CERTIFICATE_ACCEPT}
          className={cn('justify-start! h-auto! flex-row! gap-2.5! p-2! text-sm', hasCert && 'bg-primary/5!')}
          maxFiles={1}
          onDrop={handleDrop}
          onError={handleUploadError}
          src={src}
          testId={hasCert ? `sr-${certType}-status` : `add-sr-${certType}-button`}
        >
          <DropzoneEmptyState className="items-center! justify-start! my-0! w-full! flex-row! gap-2! text-muted-foreground">
            <UploadCloud className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Upload file</span>
          </DropzoneEmptyState>
          <DropzoneContent>
            <div className="flex w-full items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-success" />
              <span className="flex-1 truncate text-left font-medium text-foreground">{fileName}</span>
            </div>
          </DropzoneContent>
        </Dropzone>
        {hasCert && (
          <button
            aria-label={`Remove ${label}`}
            className="absolute top-1/2 right-2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid={`remove-sr-${certType}-button`}
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
      {uploadError && (
        <Text className="text-destructive text-sm" data-testid={`sr-${certType}-upload-error`}>
          {uploadError}
        </Text>
      )}
    </div>
  );
}

const ConfiguredBadge = () => (
  <Badge size="sm" variant="success-inverted">
    Configured
  </Badge>
);

const SrCaConfiguredBadge = () => {
  const { control } = useFormContext<FormValues>();
  const ca = useWatch({ control, name: 'schemaRegistry.mtls.ca' });
  return hasSrCertificate(ca) ? <ConfiguredBadge /> : null;
};

const SrMtlsConfiguredBadge = () => {
  const { control } = useFormContext<FormValues>();
  const [clientCert, clientKey] = useWatch({
    control,
    name: ['schemaRegistry.mtls.clientCert', 'schemaRegistry.mtls.clientKey'],
  });
  return hasSrCertificate(clientCert) && hasSrCertificate(clientKey) ? <ConfiguredBadge /> : null;
};

type DisclosureRowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  description: string;
  badge: React.ReactNode;
  testId: string;
  triggerTestId: string;
  children: React.ReactNode;
};

function DisclosureRow({
  open,
  onOpenChange,
  label,
  description,
  badge,
  testId,
  triggerTestId,
  children,
}: DisclosureRowProps) {
  return (
    <Collapsible onOpenChange={onOpenChange} open={open} testId={testId}>
      <CollapsibleTrigger
        render={
          <button
            className="-mx-2 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
            data-testid={triggerTestId}
            type="button"
          >
            <ChevronRight
              className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{label}</span>
                {!open && badge}
              </div>
              <Text className="mt-0.5 text-xs" variant="muted">
                {description}
              </Text>
            </div>
          </button>
        }
      />
      <CollapsibleContent className="mt-2 ml-6 rounded-md border bg-muted/30 p-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export const SrTlsConfiguration = () => {
  const { control, getValues, trigger } = useFormContext<FormValues>();
  const useTls = useWatch({ control, name: 'schemaRegistry.useTls' });
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
    const { clientCert, clientKey } = getValues('schemaRegistry.mtls');
    return hasSrCertificate(clientCert) || hasSrCertificate(clientKey);
  });

  return (
    <div className="space-y-3" data-testid="sr-tls-configuration">
      <FormField
        control={control}
        name="schemaRegistry.useTls"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-3">
            <FormLabel>Enable TLS</FormLabel>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  // The https-required error lives on the source URL field, so
                  // toggling TLS must refresh it or a stale error lingers.
                  trigger('schemaRegistry.sourceUrl');
                }}
                testId="sr-tls-toggle"
              />
            </FormControl>
          </FormItem>
        )}
      />

      {useTls && (
        <>
          <Text data-testid="sr-tls-intro" variant="muted">
            The connection to the source Schema Registry is encrypted. By default, its certificate is verified using the
            system trust store. Upload a custom CA below if the source uses a private or self-signed CA.{' '}
            <a className="text-primary hover:underline" href={TLS_DOCS_URL} rel="noreferrer" target="_blank">
              Learn about TLS for shadow links
            </a>
          </Text>

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
                      <SrCertificateDropzone certType="clientKey" />
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
                <Text className="text-xs" data-testid="sr-mtls-pair-hint" variant="muted">
                  Client certificate and private key must be provided together.
                </Text>
              </div>
            </DisclosureRow>
          </div>
        </>
      )}
    </div>
  );
};
