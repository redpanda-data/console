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

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { useFormContext } from 'react-hook-form';

import { AdvancedClientOptions } from './advanced-client-options';
import { BootstrapServers } from './bootstrap-servers';
import { ScramConfiguration } from './scram-configuration';
import { Card, CardContent, CardHeader } from '../../../../redpanda-ui/components/card';
import type { FormValues } from '../model';

export const ConnectionStep = () => {
  const { control } = useFormContext<FormValues>();

  return (
    <div className="space-y-4">
      {/* SL name */}
      <Card size="full">
        <CardHeader>Name</CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Shadow link name</FormLabel>
                <FormControl>
                  <Input placeholder="my-shadow-link" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
      {/* Source Cluster Connection and TLS */}
      <BootstrapServers />
      {/* SCRAM Credentials */}
      <ScramConfiguration />
      {/* Advanced Settings */}
      <AdvancedClientOptions />
    </div>
  );
};
