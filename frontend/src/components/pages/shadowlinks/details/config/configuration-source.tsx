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

'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import type React from 'react';

export interface ConfigurationSourceProps {
  shadowLink: ShadowLink;
}

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

export const ConfigurationSource = ({ shadowLink }: ConfigurationSourceProps) => {
  const clientOptions = shadowLink.configurations?.clientOptions;
  const tlsSettings = clientOptions?.tlsSettings;
  const authConfig = clientOptions?.authenticationConfiguration;
  const scramConfig =
    authConfig?.authentication?.case === 'scramConfiguration' ? authConfig.authentication.value : undefined;

  // Determine TLS status
  const isTlsEnabled = Boolean(tlsSettings?.enabled);

  let tlsCertificateLabel = '-';
  if (tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    const caPath = tlsSettings.tlsSettings.value.caPath;
    tlsCertificateLabel = `${caPath.split('/').pop() || 'certificate'} (upload)`;
  } else if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    tlsCertificateLabel = 'ca-cert.pem (upload)';
  }

  // Determine authentication status
  const isAuthEnabled = Boolean(scramConfig);

  let scramMechanismLabel = '-';
  if (scramConfig?.scramMechanism === 1) {
    scramMechanismLabel = 'SCRAM-SHA-256';
  } else if (scramConfig?.scramMechanism === 2) {
    scramMechanismLabel = 'SCRAM-SHA-512';
  }

  return (
    <div className="flex flex-col gap-6">
      <Heading level={2} testId="shadowing-title">
        Source
      </Heading>
      {/* Name Section */}
      <Card size="full" testId="source-name-card">
        <CardHeader>
          <Heading level={3}>Name</Heading>
        </CardHeader>
        <CardContent>
          <Text testId="shadow-link-name">{shadowLink.name}</Text>
        </CardContent>
      </Card>

      {/* Source Cluster Section */}
      <Card size="full" testId="source-cluster-card">
        <CardHeader>
          <Heading level={3}>Source cluster</Heading>
        </CardHeader>
        <CardContent>
          <div>
            <div className="flex items-start justify-between border-b py-3">
              <Text className="text-muted-foreground" testId="bootstrap-servers-label">
                Bootstrap server URLs
              </Text>
              <div className="flex flex-col items-end gap-1" data-testid="bootstrap-servers-value">
                {clientOptions?.bootstrapServers && clientOptions.bootstrapServers.length > 0 ? (
                  clientOptions.bootstrapServers.map((server, index) => (
                    <Text className="font-medium" key={`${server}-${index}`}>
                      {server}
                    </Text>
                  ))
                ) : (
                  <Text className="font-medium">-</Text>
                )}
              </div>
            </div>

            <ConfigField
              label="TLS status"
              testId="tls-status"
              value={
                isTlsEnabled ? (
                  <Badge testId="tls-status-badge" variant="green">
                    Enabled
                  </Badge>
                ) : (
                  <Badge testId="tls-status-badge" variant="secondary">
                    Disabled
                  </Badge>
                )
              }
            />

            {isTlsEnabled && <ConfigField label="Certificate" testId="certificate" value={tlsCertificateLabel} />}
          </div>
        </CardContent>
      </Card>

      {/* Authentication Section */}
      <Card size="full" testId="authentication-card">
        <CardHeader>
          <Heading level={3}>Authentication</Heading>
        </CardHeader>
        <CardContent>
          <div>
            <ConfigField
              label="Status"
              testId="auth-status"
              value={
                isAuthEnabled ? (
                  <Badge testId="auth-status-badge" variant="green">
                    Enabled
                  </Badge>
                ) : (
                  <Badge testId="auth-status-badge" variant="secondary">
                    Disabled
                  </Badge>
                )
              }
            />

            {isAuthEnabled && (
              <>
                <ConfigField label="Username" testId="auth-username" value={scramConfig?.username || '-'} />
                <ConfigField label="SASL mechanism" testId="auth-sasl-mechanism" value={scramMechanismLabel} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Options Section */}
      <Card size="full" testId="advanced-options-card">
        <CardContent className="p-0">
          <Accordion collapsible type="single">
            <AccordionItem value="advanced">
              <AccordionTrigger className="py-4" testId="advanced-options-trigger">
                <Heading level={3}>Advanced options</Heading>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4" testId="advanced-options-content">
                <div>
                  <ConfigField
                    label="Connection timeout (ms)"
                    testId="connection-timeout"
                    value={clientOptions?.effectiveConnectionTimeoutMs?.toString()}
                  />
                  <ConfigField
                    label="Fetch wait max (ms)"
                    testId="fetch-wait-max"
                    value={clientOptions?.effectiveFetchWaitMaxMs?.toString()}
                  />
                  <ConfigField
                    label="Fetch min bytes"
                    testId="fetch-min-bytes"
                    value={clientOptions?.effectiveFetchMinBytes?.toString()}
                  />
                  <ConfigField
                    label="Fetch max bytes"
                    testId="fetch-max-bytes"
                    value={clientOptions?.effectiveFetchMaxBytes?.toString()}
                  />
                  <ConfigField
                    label="Fetch partition max bytes"
                    testId="fetch-partition-max-bytes"
                    value={clientOptions?.effectiveFetchPartitionMaxBytes?.toString()}
                  />
                  <ConfigField
                    label="Retry backoff (ms)"
                    testId="retry-backoff"
                    value={clientOptions?.effectiveRetryBackoffMs?.toString()}
                  />
                  <ConfigField
                    label="Metadata max age (ms)"
                    testId="metadata-max-age"
                    value={clientOptions?.effectiveMetadataMaxAgeMs?.toString()}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};
