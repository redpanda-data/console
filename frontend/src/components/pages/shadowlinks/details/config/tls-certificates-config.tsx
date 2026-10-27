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

import type React from 'react';

import type { UnifiedTLSSettings } from '../../model';

const ConfigField = ({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) => (
  <div className="flex items-start justify-between border-b py-3 last:border-b-0">
    <div className="text-body text-muted-foreground" data-testid={`${testId}-label`}>
      {label}
    </div>
    <div className="text-right font-medium" data-testid={`${testId}-value`}>
      {value || '-'}
    </div>
  </div>
);

const CertificateValue = ({ value, isFilePath }: { value: string; isFilePath: boolean }) => {
  if (isFilePath && value !== '-') {
    return <code className="rounded bg-muted px-2 py-1 text-body">{value}</code>;
  }
  return <>{value}</>;
};

export type TlsCertificatesConfigProps = {
  tlsSettings?: UnifiedTLSSettings;
};

type TlsCertificateSummary = {
  inputMethod: string;
  caCertificate: string;
  clientCertificate: string;
  clientKey: string;
  hasClientCertificates: boolean;
};

const NO_TLS_CERTIFICATES: TlsCertificateSummary = {
  inputMethod: '-',
  caCertificate: '-',
  clientCertificate: '-',
  clientKey: '-',
  hasClientCertificates: false,
};

const summarizeTlsCertificates = (tlsSettings?: UnifiedTLSSettings): TlsCertificateSummary => {
  const settings = tlsSettings?.tlsSettings;
  switch (settings?.case) {
    case 'tlsFileSettings': {
      const { caPath, certPath, keyPath } = settings.value;
      return {
        inputMethod: 'File path',
        caCertificate: caPath || '-',
        clientCertificate: certPath || '-',
        clientKey: keyPath || '-',
        hasClientCertificates: Boolean(certPath || keyPath),
      };
    }
    case 'tlsPemSettings': {
      const { cert, key } = settings.value;
      return {
        inputMethod: 'Upload',
        caCertificate: 'ca-cert.pem',
        clientCertificate: cert ? 'client-cert.pem' : '-',
        clientKey: key ? 'client-key.pem' : '-',
        hasClientCertificates: Boolean(cert || key),
      };
    }
    default:
      return NO_TLS_CERTIFICATES;
  }
};

export const TlsCertificatesConfig = ({ tlsSettings }: TlsCertificatesConfigProps) => {
  const {
    inputMethod: certificateInputMethod,
    caCertificate: caCertificateLabel,
    clientCertificate: clientCertificateLabel,
    clientKey: clientKeyLabel,
    hasClientCertificates,
  } = summarizeTlsCertificates(tlsSettings);

  return (
    <>
      <ConfigField label="Certificate input method" testId="certificate-input-method" value={certificateInputMethod} />
      <ConfigField
        label="CA certificate"
        testId="ca-certificate"
        value={<CertificateValue isFilePath={certificateInputMethod === 'File path'} value={caCertificateLabel} />}
      />
      {hasClientCertificates ? (
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
      ) : null}
    </>
  );
};
