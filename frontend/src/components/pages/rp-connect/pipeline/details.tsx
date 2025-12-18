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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { useFormContext } from 'react-hook-form';

import { MAX_TASKS, MIN_TASKS } from '../tasks';

type DetailsProps = {
  readonly?: boolean;
};

export function Details({ readonly = false }: DetailsProps) {
  const { control, watch } = useFormContext();
  const name = watch('name');
  const description = watch('description');
  const computeUnits = watch('computeUnits');

  if (readonly) {
    return (
      <Card size="full">
        <CardContent>
          <div className="flex items-center gap-4">
            <Label>Pipeline Name</Label>
            <Text>{name}</Text>
          </div>

          <Accordion collapsible type="single">
            <AccordionItem value="advanced" variant="outlined">
              <AccordionTrigger>Advanced Settings</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Text>{description || '-'}</Text>
                </div>

                <div className="space-y-2">
                  <Label>Compute Units: {computeUnits}</Label>
                  <Text variant="muted">One compute unit = 0.1 CPU and 400 MB memory</Text>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="full">
      <CardContent>
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Pipeline Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter pipeline name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Accordion collapsible type="single">
          <AccordionItem value="advanced" variant="outlined">
            <AccordionTrigger>Advanced Settings</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Optional description for this pipeline" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="computeUnits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compute Units: {field.value}</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Slider
                          max={MAX_TASKS}
                          min={MIN_TASKS}
                          onValueChange={(values) => field.onChange(values[0])}
                          step={1}
                          value={[field.value]}
                        />
                        <Input
                          className="w-12"
                          max={MAX_TASKS}
                          min={MIN_TASKS}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (!Number.isNaN(value) && value >= MIN_TASKS && value <= MAX_TASKS) {
                              field.onChange(value);
                            }
                          }}
                          showStepControls
                          step={1}
                          type="number"
                          value={field.value}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-muted-foreground text-sm">
                      One compute unit = 0.1 CPU and 400 MB memory
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
