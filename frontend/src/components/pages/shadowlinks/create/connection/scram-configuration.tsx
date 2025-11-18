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

import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Text } from 'components/redpanda-ui/components/typography';
import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FormValues } from '../model';

export const ScramConfiguration = () => {
  const { control } = useFormContext<FormValues>();
  const useScram = useWatch({ control, name: 'useScram' });

  return (
    <Card data-testid="scram-authentication" size="full">
      <CardHeader>
        <FormField
          control={control}
          name="useScram"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Use SCRAM Authentication</FormLabel>
                <Text className="text-muted-foreground text-sm">
                  Authenticate with username and password using SCRAM-SHA
                </Text>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} testId="enable-scram-switch" />
              </FormControl>
            </FormItem>
          )}
        />
      </CardHeader>
      <CardContent>
        {useScram && (
          <div className="space-y-4 pt-2">
            <FormField
              control={control}
              name="scramCredentials.username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Username</FormLabel>
                  <FormControl>
                    <Input data-testid="scram-username-input" placeholder="Enter username" type="text" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="scramCredentials.password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Password</FormLabel>
                  <FormControl>
                    <Input data-testid="scram-password-input" placeholder="Enter password" type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="scramCredentials.mechanism"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SCRAM Mechanism</FormLabel>
                  <Select
                    defaultValue={String(ScramMechanism.SCRAM_SHA_256)}
                    onValueChange={(value) => field.onChange(Number(value))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="scram-mechanism-select">
                        <SelectValue placeholder="Select mechanism" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={String(ScramMechanism.SCRAM_SHA_256)}>SCRAM-SHA-256</SelectItem>
                      <SelectItem value={String(ScramMechanism.SCRAM_SHA_512)}>SCRAM-SHA-512</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
