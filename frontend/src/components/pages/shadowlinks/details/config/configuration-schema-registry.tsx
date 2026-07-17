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

'use client';

import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { format } from 'date-fns';
import { UnsupportedSchemaFeaturePolicy } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type React from 'react';
import { prettyMilliseconds } from 'utils/utils';

import type {
  UnifiedSchemaRegistryApiOptions,
  UnifiedSchemaRegistryBasicAuth,
  UnifiedSchemaRegistrySyncOptions,
  UnifiedTLSSettings,
} from '../../model';

const UNSUPPORTED_FEATURE_POLICY_LABELS: Record<number, string> = {
  // The proto contract defines UNSPECIFIED as "use the default behavior",
  // and the field docs pin that default to FAIL.
  [UnsupportedSchemaFeaturePolicy.UNSPECIFIED]: 'Fail the sync',
  [UnsupportedSchemaFeaturePolicy.FAIL]: 'Fail the sync',
  [UnsupportedSchemaFeaturePolicy.REMOVE]: 'Remove unsupported features',
};

const hasCustomCa = (tlsSettings?: UnifiedTLSSettings): boolean => {
  if (tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    return Boolean(tlsSettings.tlsSettings.value.caPath);
  }
  if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    return Boolean(tlsSettings.tlsSettings.value.ca);
  }
  return false;
};

const hasClientCertificate = (tlsSettings?: UnifiedTLSSettings): boolean => {
  if (tlsSettings?.tlsSettings?.case === 'tlsFileSettings') {
    return Boolean(tlsSettings.tlsSettings.value.certPath || tlsSettings.tlsSettings.value.keyPath);
  }
  if (tlsSettings?.tlsSettings?.case === 'tlsPemSettings') {
    return Boolean(tlsSettings.tlsSettings.value.cert || tlsSettings.tlsSettings.value.key);
  }
  return false;
};

const formatPasswordStatus = (basicAuth: UnifiedSchemaRegistryBasicAuth): string => {
  if (basicAuth.passwordSet && basicAuth.passwordSetAt) {
    return `Last changed ${format(basicAuth.passwordSetAt, "MMM d, yyyy 'at' HH:mm")}`;
  }
  if (basicAuth.passwordSet) {
    return 'Set';
  }
  return 'Not set';
};

const formatIntervalSeconds = (seconds?: number): string => {
  if (seconds === undefined) {
    return 'Cluster default';
  }
  return prettyMilliseconds(seconds * 1000);
};

const formatRequestRate = (rate?: number): string => {
  if (rate === undefined) {
    return 'Cluster default';
  }
  return `${rate} req/s`;
};

// Small uppercase label introducing a subsection of the card
const SectionLabel = ({ children }: { children: string }) => (
  <Text className="text-muted-foreground uppercase tracking-wider" variant="labelStrongXSmall">
    {children}
  </Text>
);

// Label/value grid row; `narrow` is for rows nested inside split columns
const ConfigRow = ({
  label,
  mono,
  narrow,
  testId,
  value,
}: {
  label: string;
  mono?: boolean;
  narrow?: boolean;
  testId: string;
  value: React.ReactNode;
}) => (
  <div className={cn('grid items-baseline gap-x-4', narrow ? 'grid-cols-[120px_1fr]' : 'grid-cols-[200px_1fr]')}>
    <Text className="text-muted-foreground" testId={`${testId}-label`}>
      {label}
    </Text>
    <Text className={cn('break-all', mono && 'font-mono')} testId={`${testId}-value`}>
      {value}
    </Text>
  </div>
);

// Row of mono pills used for the Schema Registry contexts and subjects lists
const PillRow = ({ label, testId, values }: { label: string; testId: string; values: string[] }) => (
  <div className="grid grid-cols-[120px_1fr] items-start gap-x-4">
    <Text className="text-muted-foreground" testId={`${testId}-label`}>
      {label}
    </Text>
    <div className="flex flex-wrap gap-1.5" data-testid={`${testId}-value`}>
      {values.map((value) => (
        <Badge className="font-mono" key={value} size="sm" tone="neutral" variant="subtle">
          {value}
        </Badge>
      ))}
    </div>
  </div>
);

// Two side-by-side columns divided by a vertical separator; stacks on small screens
const SplitColumns = ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
  <div className="flex flex-col gap-6 md:flex-row">
    <div className="flex flex-1 flex-col gap-2">{left}</div>
    <Separator className="hidden md:block" orientation="vertical" variant="subtle" />
    <div className="flex flex-1 flex-col gap-2">{right}</div>
  </div>
);

const AuthenticationColumn = ({ basicAuth }: { basicAuth?: UnifiedSchemaRegistryBasicAuth }) => (
  <>
    <Text variant="labelStrongSmall">Authentication</Text>
    {basicAuth ? (
      <div className="flex flex-col gap-1">
        <ConfigRow label="Type" narrow testId="sr-config-auth-type" value="HTTP Basic" />
        <ConfigRow label="Username" mono narrow testId="sr-config-auth-username" value={basicAuth.username} />
        <ConfigRow label="Password" narrow testId="sr-config-auth-password" value={formatPasswordStatus(basicAuth)} />
      </div>
    ) : (
      <Text className="text-muted-foreground" testId="sr-config-no-auth">
        No authentication configured.
      </Text>
    )}
  </>
);

const TlsColumn = ({ tlsSettings }: { tlsSettings?: UnifiedTLSSettings }) => (
  <>
    <Text variant="labelStrongSmall">TLS</Text>
    <div className="flex flex-col gap-1">
      <ConfigRow
        label="Enabled"
        mono
        narrow
        testId="sr-config-tls-enabled"
        value={String(Boolean(tlsSettings?.enabled))}
      />
      <ConfigRow
        label="Trust store"
        narrow
        testId="sr-config-tls-trust-store"
        value={hasCustomCa(tlsSettings) ? 'Custom CA' : 'System trust store'}
      />
      <ConfigRow
        label="Client auth"
        narrow
        testId="sr-config-tls-client-auth"
        value={hasClientCertificate(tlsSettings) ? 'mTLS certificate configured' : 'None'}
      />
    </div>
  </>
);

const ConnectionSection = ({ api }: { api: UnifiedSchemaRegistryApiOptions }) => (
  <div className="flex flex-col gap-3">
    <SectionLabel>Connection</SectionLabel>
    <ConfigRow label="Source URL:" mono testId="sr-config-source-url" value={api.sourceUrl} />
    <SplitColumns
      left={<AuthenticationColumn basicAuth={api.basicAuth} />}
      right={<TlsColumn tlsSettings={api.tlsSettings} />}
    />
  </div>
);

const DestinationMappingColumn = ({
  destinationMapping,
}: {
  destinationMapping: UnifiedSchemaRegistryApiOptions['destinationMapping'];
}) => (
  <>
    <Text variant="labelStrongSmall">Destination contexts mapping</Text>
    {destinationMapping?.case === 'exact' ? (
      <div className="flex flex-col gap-1">
        {destinationMapping.mappings.map((mapping, index) => (
          <div
            className="flex items-baseline gap-2"
            data-testid={`sr-config-mapping-${index}`}
            key={`${mapping.source}-${mapping.destination}`}
          >
            <Text as="span" className="break-all font-mono">
              {mapping.source}
            </Text>
            <Text as="span" className="text-muted-foreground">
              →
            </Text>
            <Text as="span" className="break-all font-mono">
              {mapping.destination}
            </Text>
          </div>
        ))}
      </div>
    ) : (
      <Text className="text-muted-foreground" testId="sr-config-mapping-identity">
        No mapping configured. Schemas land in the same context they came from.
      </Text>
    )}
  </>
);

const ScopeSection = ({ api }: { api: UnifiedSchemaRegistryApiOptions }) => {
  const contexts = api.sourceFilter?.contexts ?? [];
  const subjects = api.sourceFilter?.subjects ?? [];
  // An unset or empty filter means the whole source Schema Registry is replicated.
  // The destination mapping still applies then (to every source context), so its
  // column renders regardless of the selection.
  const isEntireRegistry = contexts.length === 0 && subjects.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Scope</SectionLabel>
      <SplitColumns
        left={
          isEntireRegistry ? (
            <ConfigRow label="Selection" testId="sr-config-scope-entire" value="Entire Schema Registry" />
          ) : (
            <div className="flex flex-col gap-3">
              {contexts.length > 0 && <PillRow label="Contexts:" testId="sr-config-contexts" values={contexts} />}
              {subjects.length > 0 && <PillRow label="Subjects:" testId="sr-config-subjects" values={subjects} />}
            </div>
          )
        }
        right={<DestinationMappingColumn destinationMapping={api.destinationMapping} />}
      />
    </div>
  );
};

const SyncBehaviorSection = ({ api }: { api: UnifiedSchemaRegistryApiOptions }) => {
  const hasUserSettings =
    api.tailIntervalSeconds !== undefined ||
    api.fullSyncIntervalSeconds !== undefined ||
    api.maxSourceRequestsPerSecond !== undefined ||
    api.unsupportedSchemaFeaturePolicy !== UnsupportedSchemaFeaturePolicy.UNSPECIFIED;

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Sync behavior</SectionLabel>
      {hasUserSettings ? (
        <div className="flex flex-col gap-1">
          <ConfigRow
            label="Tail interval:"
            testId="sr-config-tail-interval"
            value={formatIntervalSeconds(api.tailIntervalSeconds ?? api.effectiveTailIntervalSeconds)}
          />
          <ConfigRow
            label="Full sync interval:"
            testId="sr-config-full-sync-interval"
            value={formatIntervalSeconds(api.fullSyncIntervalSeconds ?? api.effectiveFullSyncIntervalSeconds)}
          />
          <ConfigRow
            label="Max source request rate:"
            testId="sr-config-max-request-rate"
            value={formatRequestRate(api.maxSourceRequestsPerSecond ?? api.effectiveMaxSourceRequestsPerSecond)}
          />
          <ConfigRow
            label="Unsupported schema features:"
            testId="sr-config-unsupported-features"
            value={
              UNSUPPORTED_FEATURE_POLICY_LABELS[api.unsupportedSchemaFeaturePolicy] ??
              `Unknown policy (${api.unsupportedSchemaFeaturePolicy})`
            }
          />
        </div>
      ) : (
        <ConfigRow label="All settings:" testId="sr-config-sync-defaults" value="Cluster defaults" />
      )}
    </div>
  );
};

const ApiModeBody = ({ api }: { api: UnifiedSchemaRegistryApiOptions }) => (
  <div className="flex flex-col gap-4">
    <Text className="text-muted-foreground" testId="schema-registry-api-description">
      Schemas replicate from the source Schema Registry over its REST API.
    </Text>
    <Separator variant="subtle" />
    <ConnectionSection api={api} />
    <Separator variant="subtle" />
    <ScopeSection api={api} />
    <Separator variant="subtle" />
    <SyncBehaviorSection api={api} />
  </div>
);

export type ConfigurationSchemaRegistryProps = {
  syncOptions?: UnifiedSchemaRegistrySyncOptions;
};

// Read-only display of the Schema Registry shadowing configuration
export const ConfigurationSchemaRegistry = ({ syncOptions }: ConfigurationSchemaRegistryProps) => {
  const mode = syncOptions?.schemaRegistryShadowingMode;

  let badges: React.ReactNode;
  let body: React.ReactNode;

  if (mode?.case === 'shadowSchemaRegistryApi') {
    const statusBadge = mode.value.paused ? (
      <Badge testId="schema-registry-status-badge" tone="warning" variant="subtle">
        Paused
      </Badge>
    ) : (
      <Badge testId="schema-registry-status-badge" tone="success" variant="subtle">
        Enabled
      </Badge>
    );
    badges = (
      <>
        <Badge testId="schema-registry-mode-badge" tone="info" variant="subtle">
          Sync over API
        </Badge>
        {statusBadge}
      </>
    );
    body = <ApiModeBody api={mode.value} />;
  } else if (mode?.case === 'shadowSchemaRegistryTopic') {
    badges = (
      <>
        <Badge className="font-mono" testId="schema-registry-mode-badge" tone="info" variant="subtle">
          _schemas topic
        </Badge>
        <Badge testId="schema-registry-status-badge" tone="success" variant="subtle">
          Enabled
        </Badge>
      </>
    );
    body = (
      <Text className="text-muted-foreground" testId="schema-registry-topic-description">
        Replicate the source cluster's _schemas topic, which replaces the shadow cluster's Schema Registry.
      </Text>
    );
  } else {
    badges = (
      <Badge testId="schema-registry-status-badge" tone="neutral" variant="subtle">
        Disabled
      </Badge>
    );
    body = (
      <Text className="text-muted-foreground" testId="schema-registry-disabled-description">
        Schema Registry shadowing is off. The shadow cluster keeps its own independent Schema Registry.
      </Text>
    );
  }

  return (
    <Card size="full" testId="schema-registry-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Heading level={3}>Schema Registry</Heading>
          <div className="flex items-center gap-2">{badges}</div>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
};
