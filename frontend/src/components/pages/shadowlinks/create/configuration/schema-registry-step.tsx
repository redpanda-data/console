/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { FormControl, FormDescription, FormField, FormItem } from 'components/redpanda-ui/components/form';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Text } from 'components/redpanda-ui/components/typography';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useSupportedFeaturesStore } from 'state/supported-features';

import { ShadowSchemaRegistrySection } from './schema-registry/shadow-schema-registry-section';
import { type FormValues, initialValues, SCHEMA_REGISTRY_MODE } from '../model';

/**
 * TEMPORARY: The original switch-only section, rendered directly by the edit page (the
 * redesigned section can't appear there).
 *
 * `readOnlyApiMode` swaps the switch for an info card: the edit flow can't
 * express API sync for now.
 */
export const LegacySchemaRegistrySection = ({ readOnlyApiMode = false }: { readOnlyApiMode?: boolean }) => {
  const { control } = useFormContext<FormValues>();

  if (readOnlyApiMode) {
    return (
      <Card size="full">
        <CardHeader>
          <CardTitle>Shadow Schema Registry</CardTitle>
        </CardHeader>
        <CardContent>
          <Text data-testid="sr-api-mode-readonly" variant="muted">
            This shadow link syncs Schema Registry schemas over the Schema Registry API. That configuration can't be
            edited here. Use rpk or the Admin API to change it.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>Shadow Schema Registry</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={control}
          name="enableSchemaRegistrySync"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <div className="space-y-1">
                <FormDescription>
                  Replicate the source cluster's _schema topic, which replaces the shadow cluster's Schema Registry.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} testId="sr-enable-switch" />
              </FormControl>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
};

export const SchemaRegistryStep = () => {
  const { getValues, setValue } = useFormContext<FormValues>();
  // Show the redesigned section only when the connected cluster reports SR sync
  // over the Schema Registry API (Redpanda >= 26.2.0). Fails closed: a null
  // store (compatibility not loaded or the fetch failed) and older backends
  // that omit the endpoint both leave this false, falling back to the legacy
  // switch, which works on every cluster.
  const showRedesigned = useSupportedFeaturesStore((s) => s.shadowLinkSchemaRegistrySync);

  // When we fall back to the legacy UI, reset the hidden redesigned fields so
  // stale values can't block validation or leak into the request. Only fires
  // if the redesigned section had been shown and set a non-'none' mode, so on
  // an initial legacy render (mode already 'none') it's a no-op.
  useEffect(() => {
    if (showRedesigned) {
      return;
    }
    const priorMode = getValues('schemaRegistry.mode');
    if (priorMode !== SCHEMA_REGISTRY_MODE.NONE) {
      setValue('schemaRegistry', structuredClone(initialValues.schemaRegistry));
      // Topic sync also exists on older clusters, so keep it as the legacy
      // switch being on.
      setValue('enableSchemaRegistrySync', priorMode === SCHEMA_REGISTRY_MODE.TOPIC);
    }
  }, [showRedesigned, getValues, setValue]);

  return showRedesigned ? <ShadowSchemaRegistrySection /> : <LegacySchemaRegistrySection />;
};
