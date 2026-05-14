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

import { zodResolver } from '@hookform/resolvers/zod';
import { Form, SimpleFormField } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Heading } from 'components/redpanda-ui/components/typography';
import { useImperativeHandle, useMemo, useRef } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { useListComponentsQuery } from 'react-query/api/connect';
import { z } from 'zod';

import type { PipelineTemplate, TemplateSlot, TemplateSlotSection } from './pipeline-template-types';
import { SecretSlotField } from './slot-fields/secret-slot';
import { SelectSlotField } from './slot-fields/select-slot';
import { StringSlotField } from './slot-fields/string-slot';
import { TopicSlotField } from './slot-fields/topic-slot';
import { stitchTemplateYaml } from './template-deploy';
import { parseSchema } from '../utils/schema';

const SECTION_LABELS: Record<TemplateSlotSection, string> = {
  source: 'Source',
  sink: 'Sink',
  options: 'Options',
};

const SECTION_ORDER: TemplateSlotSection[] = ['source', 'sink', 'options'];

const PIPELINE_NAME_FIELD = '__pipelineName';

const buildSchema = (template: PipelineTemplate) => {
  const shape: Record<string, z.ZodTypeAny> = {
    [PIPELINE_NAME_FIELD]: z.string().min(1, 'Pipeline name is required'),
  };
  for (const slot of template.slots) {
    if (slot.required) {
      shape[slot.id] = z.string().min(1, `${slot.label} is required`);
    } else {
      shape[slot.id] = z.string().optional().default('');
    }
  }
  return z.object(shape);
};

const defaultValuesFor = (template: PipelineTemplate): Record<string, string> => {
  const defaults: Record<string, string> = {
    [PIPELINE_NAME_FIELD]: template.defaultPipelineName,
  };
  for (const slot of template.slots) {
    if (slot.kind === 'string' && slot.default) {
      defaults[slot.id] = slot.default;
    } else if (slot.kind === 'topic' && slot.default) {
      defaults[slot.id] = slot.default;
    } else if (slot.kind === 'select' && slot.default) {
      defaults[slot.id] = slot.default;
    } else {
      defaults[slot.id] = '';
    }
  }
  return defaults;
};

const groupSlotsBySection = (slots: TemplateSlot[]): Record<TemplateSlotSection, TemplateSlot[]> => {
  const grouped: Record<TemplateSlotSection, TemplateSlot[]> = {
    source: [],
    sink: [],
    options: [],
  };
  for (const slot of slots) {
    grouped[slot.section].push(slot);
  }
  return grouped;
};

type FormValues = Record<string, string>;

export type TemplateFormSubmitPayload = {
  pipelineName: string;
  yaml: string;
  template: PipelineTemplate;
};

/**
 * Imperative handle exposed via a forwarded ref so the parent dialog can read
 * the current YAML at cancel-time without re-rendering the form.
 */
export type TemplateFormPanelHandle = {
  /** Returns the YAML stitched from whatever the user has typed so far. */
  getCurrentYaml: () => string;
  /** Whether the user has touched any field since the form mounted. */
  isDirty: () => boolean;
  /** Set a slot's value (used after returning from the in-dialog secret-create step). */
  setSlotValue: (slotId: string, value: string) => void;
};

export type TemplateFormPanelProps = {
  template: PipelineTemplate;
  /**
   * HTML form element id — exposed so the parent dialog's footer submit button
   * can target the form via the `form` attribute even though it's outside the
   * form's DOM subtree.
   */
  formId: string;
  onSubmit: (payload: TemplateFormSubmitPayload) => void;
  /**
   * When provided, secret slots delegate their "Create secret" click to the
   * parent (so the parent can render an in-dialog step instead of a nested
   * dialog).
   */
  onRequestCreateSecret?: (slotId: string, suggestedName: string | undefined) => void;
  ref?: React.Ref<TemplateFormPanelHandle>;
};

export const TemplateFormPanel = ({
  template,
  formId,
  onSubmit,
  onRequestCreateSecret,
  ref,
}: TemplateFormPanelProps) => {
  const { data: componentListResponse } = useListComponentsQuery();
  const components = useMemo(
    () => (componentListResponse?.components ? parseSchema(componentListResponse.components) : []),
    [componentListResponse]
  );

  const schema = useMemo(() => buildSchema(template), [template]);
  const defaultValues = useMemo(() => defaultValuesFor(template), [template]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: defaultValues as FormValues,
    mode: 'onBlur',
  });

  const stitchCurrentYaml = (values: FormValues): string => {
    const { [PIPELINE_NAME_FIELD]: _ignored, ...slotValues } = values;
    return stitchTemplateYaml({ template, values: slotValues as Record<string, string>, components });
  };

  const handleRef = useRef<TemplateFormPanelHandle>({
    getCurrentYaml: () => stitchCurrentYaml(form.getValues()),
    isDirty: () => form.formState.isDirty,
    setSlotValue: (slotId, value) => form.setValue(slotId, value, { shouldDirty: true, shouldValidate: true }),
  });
  // Keep the handle's closures referring to the latest form / template every render.
  handleRef.current = {
    getCurrentYaml: () => stitchCurrentYaml(form.getValues()),
    isDirty: () => form.formState.isDirty,
    setSlotValue: (slotId, value) => form.setValue(slotId, value, { shouldDirty: true, shouldValidate: true }),
  };
  useImperativeHandle(ref, () => handleRef.current, []);

  const sections = groupSlotsBySection(template.slots);

  const submitHandler = form.handleSubmit((values) => {
    onSubmit({
      pipelineName: values[PIPELINE_NAME_FIELD] ?? template.defaultPipelineName,
      yaml: stitchCurrentYaml(values),
      template,
    });
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-5"
        data-testid={`template-form-${template.id}`}
        id={formId}
        onSubmit={submitHandler}
      >
        <SimpleFormField
          control={form.control}
          description="Display name for the pipeline."
          label="Pipeline name"
          name={PIPELINE_NAME_FIELD}
          required
        >
          {(field) => (
            <Input
              data-testid="slot-pipeline-name"
              onChange={field.onChange}
              placeholder="my-pipeline"
              value={field.value ?? ''}
            />
          )}
        </SimpleFormField>

        {SECTION_ORDER.map((section) => {
          const slots = sections[section];
          if (slots.length === 0) {
            return null;
          }
          return (
            <section
              aria-labelledby={`section-${section}`}
              className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4"
              data-testid={`template-section-${section}`}
              key={section}
            >
              <Heading className="font-medium text-sm uppercase tracking-wide" id={`section-${section}`} level={3}>
                {SECTION_LABELS[section]}
              </Heading>
              {slots.map((slot) => {
                switch (slot.kind) {
                  case 'string':
                    return <StringSlotField control={form.control} key={slot.id} slot={slot} />;
                  case 'select':
                    return <SelectSlotField control={form.control} key={slot.id} slot={slot} />;
                  case 'topic':
                    return <TopicSlotField control={form.control} key={slot.id} slot={slot} />;
                  case 'secret':
                    return (
                      <SecretSlotField
                        control={form.control}
                        key={slot.id}
                        onRequestCreateSecret={onRequestCreateSecret}
                        onSecretCreated={(slotId, secretName) =>
                          form.setValue(slotId, secretName, { shouldDirty: true, shouldValidate: true })
                        }
                        slot={slot}
                      />
                    );
                  default:
                    return null;
                }
              })}
            </section>
          );
        })}
      </form>
    </Form>
  );
};
