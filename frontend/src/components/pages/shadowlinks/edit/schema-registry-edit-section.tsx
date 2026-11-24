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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { TriangleAlert } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSupportedFeaturesStore } from 'state/supported-features';

import { ShadowSchemaRegistrySection } from '../create/configuration/schema-registry/shadow-schema-registry-section';
import { LegacySchemaRegistrySection } from '../create/configuration/schema-registry-step';
import { type FormValues, SCHEMA_REGISTRY_MODE, type SchemaRegistryMode } from '../create/model';

const lockedModes: (originalMode: SchemaRegistryMode) => SchemaRegistryMode[] = (originalMode) => {
  if (originalMode === SCHEMA_REGISTRY_MODE.TOPIC) {
    return [SCHEMA_REGISTRY_MODE.API];
  }
  if (originalMode === SCHEMA_REGISTRY_MODE.API) {
    return [SCHEMA_REGISTRY_MODE.TOPIC];
  }
  return [];
};

const ModeTransitionAlert = ({ originalMode }: { originalMode: SchemaRegistryMode }) => {
  const { control } = useFormContext<FormValues>();
  const mode = useWatch({ control, name: 'schemaRegistry.mode' });

  if (originalMode === SCHEMA_REGISTRY_MODE.TOPIC && mode !== SCHEMA_REGISTRY_MODE.TOPIC) {
    return (
      <Alert icon={<TriangleAlert />} testId="sr-mode-transition-topic-alert" variant="warning">
        <AlertDescription>
          Turning off Redpanda schema shadowing does not remove the _schemas shadow topic if it was already added. To
          stop shadowing it, fail over or delete the shadow topic after saving.
        </AlertDescription>
      </Alert>
    );
  }
  if (originalMode === SCHEMA_REGISTRY_MODE.API && mode !== SCHEMA_REGISTRY_MODE.API) {
    return (
      <Alert icon={<TriangleAlert />} testId="sr-mode-transition-api-alert" variant="warning">
        <AlertDescription>
          Saving will discard the stored Schema Registry connection settings, including credentials, scope, and sync
          behavior.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
};

export type SchemaRegistryEditSectionProps = {
  /** The mode hydrated from the server; drives locked tabs and transition warnings. */
  originalMode: SchemaRegistryMode;
};

/**
 * Without the Schema Registry API sync capability, the legacy controls cannot change an existing API-mode link.
 *
 * Switching between topic and API mode requires saving None first; from None either mode is reachable.
 */
export const SchemaRegistryEditSection = ({ originalMode }: SchemaRegistryEditSectionProps) => {
  const showRedesigned = useSupportedFeaturesStore((s) => s.shadowLinkSchemaRegistrySync);

  if (!showRedesigned) {
    return <LegacySchemaRegistrySection readOnlyApiMode={originalMode === SCHEMA_REGISTRY_MODE.API} />;
  }

  return (
    <ShadowSchemaRegistrySection
      disabledModes={lockedModes(originalMode)}
      modeNotice={<ModeTransitionAlert originalMode={originalMode} />}
    />
  );
};
