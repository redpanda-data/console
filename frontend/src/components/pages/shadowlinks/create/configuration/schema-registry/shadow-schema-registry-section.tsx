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

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { ScopeSection } from './scope-section';
import { SourceConnectionSection } from './source-connection-section';
import { SyncBehaviorSection } from './sync-behavior-section';
import { type FormValues, SCHEMA_REGISTRY_MODE, type SchemaRegistryMode } from '../../model';

const MODE_DESCRIPTIONS: Record<SchemaRegistryMode, string> = {
  [SCHEMA_REGISTRY_MODE.TOPIC]:
    "Replicate the source cluster's _schemas topic, which replaces the shadow cluster's Schema Registry. No additional configuration.",
  [SCHEMA_REGISTRY_MODE.API]:
    'Replicate schemas from any Schema Registry over its REST API, including Confluent Cloud. Supports subject filtering and context mapping.',
  [SCHEMA_REGISTRY_MODE.NONE]:
    'Schema Registry shadowing is off. The shadow cluster keeps its own independent Schema Registry.',
};

export const ShadowSchemaRegistrySection = () => {
  const { control, getValues, setValue } = useFormContext<FormValues>();
  const mode = useWatch({ control, name: 'schemaRegistry.mode' });

  // Migrate a legacy-switch choice into this UI: the boolean may already be on
  // (toggled while the gate was closed), and leaving mode at 'none' would make
  // the tabs disagree with what gets submitted.
  useEffect(() => {
    if (getValues('enableSchemaRegistrySync') && getValues('schemaRegistry.mode') === SCHEMA_REGISTRY_MODE.NONE) {
      setValue('schemaRegistry.mode', SCHEMA_REGISTRY_MODE.TOPIC);
    }
  }, [getValues, setValue]);

  const handleModeChange = (next: string) => {
    if (
      next !== SCHEMA_REGISTRY_MODE.TOPIC &&
      next !== SCHEMA_REGISTRY_MODE.API &&
      next !== SCHEMA_REGISTRY_MODE.NONE
    ) {
      return;
    }
    setValue('schemaRegistry.mode', next, { shouldValidate: true });
    setValue('enableSchemaRegistrySync', next === SCHEMA_REGISTRY_MODE.TOPIC, { shouldDirty: true });
  };

  return (
    <Card data-testid="shadow-schema-registry-section" size="full">
      <CardHeader>
        <CardTitle>Shadow Schema Registry</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Tabs onValueChange={handleModeChange} value={mode}>
              <TabsList>
                <TabsTrigger testId="sr-mode-topic-tab" value={SCHEMA_REGISTRY_MODE.TOPIC}>
                  _schemas topic
                </TabsTrigger>
                <TabsTrigger testId="sr-mode-api-tab" value={SCHEMA_REGISTRY_MODE.API}>
                  Sync over API
                </TabsTrigger>
                <TabsTrigger testId="sr-mode-none-tab" value={SCHEMA_REGISTRY_MODE.NONE}>
                  None
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="text-body-sm text-muted-foreground" data-testid="sr-mode-description">
              {MODE_DESCRIPTIONS[mode]}
            </div>
          </div>

          {mode === SCHEMA_REGISTRY_MODE.API && (
            <>
              <Separator variant="subtle" />
              <SourceConnectionSection />
              <Separator variant="subtle" />
              <ScopeSection />
              <Separator variant="subtle" />
              <SyncBehaviorSection />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
