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

import { FormControl, FormField, FormItem, FormLabel } from 'components/redpanda-ui/components/form';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { useFormContext } from 'react-hook-form';

import type { FormValues } from '../model';

export const TlsConfiguration = () => {
  const { control } = useFormContext<FormValues>();
  return (
    <div className="space-y-4" data-testid="tls-configuration">
      <FormField
        control={control}
        name="useTls"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <div>
              <FormLabel>Enable TLS</FormLabel>
            </div>
            <FormControl>
              <Tabs
                data-testid="tls-toggle"
                onValueChange={(value) => field.onChange(value === 'true')}
                value={String(field.value)}
              >
                <TabsList variant="default">
                  <TabsTrigger data-testid="tls-enabled-tab" value="true">
                    Enabled
                  </TabsTrigger>
                  <TabsTrigger data-testid="tls-disabled-tab" value="false">
                    Disabled
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
};
