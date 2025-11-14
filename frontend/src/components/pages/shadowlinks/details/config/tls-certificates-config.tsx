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
import { Text } from 'components/redpanda-ui/components/typography';
import type { TLSSettings } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type React from 'react';

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

const CertificateValue = ({ value, isFilePath }: { value: string; isFilePath: boolean }) => {
  if (isFilePath && value !== '-') {
    return <code className="rounded bg-muted px-2 py-1 text-sm">{value}</code>;
  }
  return <>{value}</>;
};

export interface TlsCertificatesConfigProps {
  tlsSettings?: TLSSettings;
}

export const TlsCertificatesConfig = ({ tlsSettings }: TlsCertificatesConfigProps) => {
  // CA Certificate
  let caCertificateLabel = '-';
  let certificateInputMethod = '-';
  if (tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    const caPath = tlsSettings.tlsSettings.value.caPath;
    caCertificateLabel = caPath || '-';
    certificateInputMethod = 'File Path';
  } else if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    caCertificateLabel = 'ca-cert.pem';
    certificateInputMethod = 'Upload';
  }

  // mTLS - Check if client cert and key are provided
  const isMtlsEnabled =
    (tlsSettings?.tlsSettings?.case === 'tlsFileSettings' &&
      Boolean(tlsSettings.tlsSettings.value.certPath) &&
      Boolean(tlsSettings.tlsSettings.value.keyPath)) ||
    (tlsSettings?.tlsSettings?.case === 'tlsPemSettings' &&
      Boolean(tlsSettings.tlsSettings.value.cert) &&
      Boolean(tlsSettings.tlsSettings.value.key));

  let clientCertificateLabel = '-';
  let clientKeyLabel = '-';
  if (tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    const certPath = tlsSettings.tlsSettings.value.certPath;
    const keyPath = tlsSettings.tlsSettings.value.keyPath;
    clientCertificateLabel = certPath || '-';
    clientKeyLabel = keyPath || '-';
  } else if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    clientCertificateLabel = tlsSettings.tlsSettings.value.cert ? 'client-cert.pem' : '-';
    clientKeyLabel = tlsSettings.tlsSettings.value.key ? 'client-key.pem' : '-';
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
        value={<CertificateValue isFilePath={certificateInputMethod === 'File Path'} value={caCertificateLabel} />}
      />
      {isMtlsEnabled && (
        <>
          <ConfigField
            label="Client certificate"
            testId="client-certificate"
            value={
              <CertificateValue isFilePath={certificateInputMethod === 'File Path'} value={clientCertificateLabel} />
            }
          />
          <ConfigField
            label="Client private key"
            testId="client-key"
            value={<CertificateValue isFilePath={certificateInputMethod === 'File Path'} value={clientKeyLabel} />}
          />
        </>
      )}
    </>
  );
};
