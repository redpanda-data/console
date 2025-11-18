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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TLSSettings } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type React from 'react';
import { useState } from 'react';

const ConfigField = ({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) => (
  <div className="flex items-start justify-between border-b py-3 last:border-b-0">
    <Text className="text-muted-foreground" testId={`${testId}-label`}>
      {label}
    </Text>
    <div className="text-right font-medium" data-testid={`${testId}-value`}>
      {value || '-'}
    </div>
  </div>
);

const CertificateValue = ({ value, isFilePath, isPem }: { value: string; isFilePath: boolean; isPem?: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isFilePath && value !== '-') {
    return <code className="rounded bg-muted px-2 py-1 text-sm">{value}</code>;
  }

  if (isPem && value !== '-') {
    const lines = value.split('\n');
    const shouldTruncate = lines.length > 3;
    const preview = shouldTruncate ? `${lines[0]}\n...\n${lines[lines.length - 1]}` : value;

    return (
      <div className="flex flex-col items-end gap-2">
        <code className="rounded bg-muted px-2 py-1 text-sm whitespace-pre-wrap break-all max-w-full">
          {isExpanded ? value : preview}
        </code>
        {shouldTruncate && (
          <Button
            className="text-xs h-auto py-1"
            onClick={() => setIsExpanded(!isExpanded)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show full certificate
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  return <>{value}</>;
};

export interface TlsCertificatesConfigProps {
  tlsSettings?: TLSSettings;
}

export const TlsCertificatesConfig = ({ tlsSettings }: TlsCertificatesConfigProps) => {
  const isFileMode = tlsSettings?.tlsSettings?.case === 'tlsFileSettings';
  const isPemMode = tlsSettings?.tlsSettings?.case === 'tlsPemSettings';

  // CA Certificate
  let caCertificateValue = '-';
  let certificateInputMethod = '-';
  if (isFileMode && tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    const caPath = tlsSettings.tlsSettings.value.caPath;
    caCertificateValue = caPath || '-';
    certificateInputMethod = 'File Path';
  } else if (isPemMode && tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    caCertificateValue = tlsSettings.tlsSettings.value.ca || '-';
    certificateInputMethod = 'Upload';
  }

  // mTLS - Check if client cert and key are provided
  // Note: The backend doesn't return the private key for security reasons, but returns keyFingerprint as proof
  const isMtlsEnabled =
    (tlsSettings?.tlsSettings?.case === 'tlsFileSettings' &&
      Boolean(tlsSettings.tlsSettings.value.certPath) &&
      Boolean(tlsSettings.tlsSettings.value.keyPath)) ||
    (tlsSettings?.tlsSettings?.case === 'tlsPemSettings' &&
      Boolean(tlsSettings.tlsSettings.value.cert) &&
      Boolean(tlsSettings.tlsSettings.value.keyFingerprint));

  let clientCertificateValue = '-';
  let clientKeyValue = '-';
  if (isFileMode && tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    const certPath = tlsSettings.tlsSettings.value.certPath;
    const keyPath = tlsSettings.tlsSettings.value.keyPath;
    clientCertificateValue = certPath || '-';
    clientKeyValue = keyPath || '-';
  } else if (isPemMode && tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    clientCertificateValue = tlsSettings.tlsSettings.value.cert || '-';
    clientKeyValue = tlsSettings.tlsSettings.value.keyFingerprint || '-';
  }
  return (
    <>
      <ConfigField
        label="mTLS status"
        testId="mtls-status"
        value={
          isMtlsEnabled ? (
            <Badge testId="mtls-status-badge" variant="green">
              Enabled
            </Badge>
          ) : (
            <Badge testId="mtls-status-badge" variant="secondary">
              Disabled
            </Badge>
          )
        }
      />
      <ConfigField label="Certificate input method" testId="certificate-input-method" value={certificateInputMethod} />
      <ConfigField
        label="CA certificate"
        testId="ca-certificate"
        value={<CertificateValue isFilePath={isFileMode} isPem={isPemMode} value={caCertificateValue} />}
      />
      {isMtlsEnabled && (
        <>
          <ConfigField
            label="Client certificate"
            testId="client-certificate"
            value={<CertificateValue isFilePath={isFileMode} isPem={isPemMode} value={clientCertificateValue} />}
          />
          <ConfigField
            label="Client private key fingerprint (SHA-256)"
            testId="client-key"
            value={<CertificateValue isFilePath={isFileMode} isPem={false} value={clientKeyValue} />}
          />
        </>
      )}
    </>
  );
};
