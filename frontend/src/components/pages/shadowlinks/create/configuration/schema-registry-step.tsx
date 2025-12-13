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
import { useFormContext } from 'react-hook-form';

import type { FormValues } from '../model';

export const SchemaRegistryStep = () => {
  const { control } = useFormContext<FormValues>();

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
