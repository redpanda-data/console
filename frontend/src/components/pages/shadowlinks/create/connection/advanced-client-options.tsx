/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { FormValues } from '../model';

export const AdvancedClientOptions = () => {
  const { control } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <Card className="gap-0" size="full">
        <CardHeader>
          <CardTitle>Advanced options</CardTitle>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button className="w-fit p-0" data-testid="advanced-options-toggle" size="sm" variant="ghost">
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CardContent>
          <CollapsibleContent className="mt-4 space-y-4" data-testid="advanced-options-content">
            <FormField
              control={control}
              name="advanceClientOptions.metadataMaxAgeMs"
              render={({ field }) => (
                <FormItem data-testid="metadata-max-age-field">
                  <FormLabel>Metadata max age in ms</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormDescription>
                    Maximum time in milliseconds before metadata is refreshed. Controls how often the client updates
                    topic and partition information.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="advanceClientOptions.connectionTimeoutMs"
              render={({ field }) => (
                <FormItem data-testid="connection-timeout-field">
                  <FormLabel>Connection timeout in ms</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormDescription>
                    Maximum time in milliseconds to wait when establishing a connection to a broker.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="advanceClientOptions.retryBackoffMs"
              render={({ field }) => (
                <FormItem data-testid="retry-backoff-field">
                  <FormLabel>Retry backoff in ms</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormDescription>
                    Time in milliseconds to wait before retrying a failed request. Helps prevent overwhelming the broker
                    with rapid retry attempts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="advanceClientOptions.fetchWaitMaxMs"
              render={({ field }) => (
                <FormItem data-testid="fetch-wait-max-field">
                  <FormLabel>Fetch wait max in ms</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormDescription>
                    Maximum time in milliseconds the broker will wait before responding to a fetch request if there
                    isn't enough data to meet the minimum fetch size.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="advanceClientOptions.fetchMinBytes"
              render={({ field }) => (
                <FormItem data-testid="fetch-min-bytes-field">
                  <FormLabel>Fetch min in bytes</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormDescription>
                    Minimum amount of data in bytes the broker should return for a fetch request. Lower values improve
                    latency but may reduce throughput.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="advanceClientOptions.fetchMaxBytes"
              render={({ field }) => (
                <FormItem data-testid="fetch-max-bytes-field">
                  <FormLabel>Fetch max in bytes</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormDescription>
                    Maximum amount of data in bytes the broker will return for a fetch request. Controls memory usage
                    and network bandwidth.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
};
