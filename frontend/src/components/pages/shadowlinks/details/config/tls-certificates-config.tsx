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
    certificateInputMethod = 'File path';
  } else if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    caCertificateLabel = 'ca-cert.pem';
    certificateInputMethod = 'Upload';
  }

  // Client certificates
  let clientCertificateLabel = '-';
  let clientKeyLabel = '-';
  let hasClientCertificates = false;

  if (tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    const certPath = tlsSettings.tlsSettings.value.certPath;
    const keyPath = tlsSettings.tlsSettings.value.keyPath;
    clientCertificateLabel = certPath || '-';
    clientKeyLabel = keyPath || '-';
    hasClientCertificates = Boolean(certPath || keyPath);
  } else if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    clientCertificateLabel = tlsSettings.tlsSettings.value.cert ? 'client-cert.pem' : '-';
    clientKeyLabel = tlsSettings.tlsSettings.value.key ? 'client-key.pem' : '-';
    hasClientCertificates = Boolean(tlsSettings.tlsSettings.value.cert || tlsSettings.tlsSettings.value.key);
  }

  return (
    <>
      <ConfigField label="Certificate input method" testId="certificate-input-method" value={certificateInputMethod} />
      <ConfigField
        label="CA certificate"
        testId="ca-certificate"
        value={<CertificateValue isFilePath={certificateInputMethod === 'File path'} value={caCertificateLabel} />}
      />
      {hasClientCertificates && (
        <>
          <ConfigField
            label="Client certificate"
            testId="client-certificate"
            value={
              <CertificateValue isFilePath={certificateInputMethod === 'File path'} value={clientCertificateLabel} />
            }
          />
          <ConfigField
            label="Client private key"
            testId="client-key"
            value={<CertificateValue isFilePath={certificateInputMethod === 'File path'} value={clientKeyLabel} />}
          />
        </>
      )}
    </>
  );
};
