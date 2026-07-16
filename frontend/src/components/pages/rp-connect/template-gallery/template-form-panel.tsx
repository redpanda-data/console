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
import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { Form, SimpleFormField } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Waypoints } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { PipelineTemplate, TemplateEndpoint, TemplateSlot, TemplateSlotSection } from './pipeline-template-types';
import { SecretSlotField } from './slot-fields/secret-slot';
import { SelectSlotField } from './slot-fields/select-slot';
import { StringSlotField } from './slot-fields/string-slot';
import { TopicSlotField } from './slot-fields/topic-slot';
import { stitchTemplateYaml } from './template-deploy';
import { applySchemaToSlots } from './template-schema';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { useEnrichedComponents } from '../utils/use-enriched-components';

const SECTION_LABELS: Record<TemplateSlotSection, string> = {
  source: 'Source',
  sink: 'Sink',
  options: 'Options',
};

const SECTION_ORDER: TemplateSlotSection[] = ['source', 'sink', 'options'];

const endpointFor = (section: TemplateSlotSection, template: PipelineTemplate): TemplateEndpoint | null => {
  if (section === 'source') {
    return template.source;
  }
  if (section === 'sink') {
    return template.sink;
  }
  return null;
};

const EndpointBadge = ({ endpoint }: { endpoint: TemplateEndpoint }) => {
  const resolvedName = endpoint.logoOverride ?? endpoint.component;
  const Logo = componentLogoMap[resolvedName as ComponentName];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 font-mono font-normal text-foreground text-xs normal-case tracking-normal">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {Logo ? (
          <ConnectorLogo className="h-4 w-4" name={resolvedName as ComponentName} />
        ) : (
          <Waypoints aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </span>
      {endpoint.component}
    </span>
  );
};

const PIPELINE_NAME_FIELD = '__pipelineName';

// Exported for tests: slot validation rules (required, list entries, entryPattern) live here.
export const buildSchema = (slots: TemplateSlot[]) => {
  const shape: Record<string, z.ZodTypeAny> = {
    [PIPELINE_NAME_FIELD]: z.string().min(1, 'Pipeline name is required'),
  };
  for (const slot of slots) {
    const isList = slot.kind === 'string' && slot.list;
    const entryPattern = slot.kind === 'string' ? slot.entryPattern : undefined;

    let field: z.ZodType<string>;
    if (!slot.required) {
      field = z.string();
    } else if (isList) {
      // Comma-separated multi-value: require at least one non-blank entry (",," must not pass).
      field = z.string().refine((v) => v.split(',').some((part) => part.trim()), `${slot.label} is required`);
    } else {
      field = z.string().min(1, `${slot.label} is required`);
    }
    if (entryPattern) {
      // Validate each trimmed entry; blanks are the required check's concern, not the pattern's.
      const entriesOf = (v: string) => (isList ? v.split(',') : [v]).map((part) => part.trim()).filter(Boolean);
      field = field.refine((v) => entriesOf(v).every((entry) => entryPattern.regex.test(entry)), entryPattern.message);
    }
    shape[slot.id] = slot.required ? field : field.optional().default('');
  }
  return z.object(shape);
};

const defaultValuesFor = (template: PipelineTemplate, slots: TemplateSlot[]): Record<string, string> => {
  const defaults: Record<string, string> = {
    [PIPELINE_NAME_FIELD]: template.defaultPipelineName,
  };
  for (const slot of slots) {
    defaults[slot.id] = slot.kind === 'secret' ? '' : (slot.default ?? '');
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
};

/** Lets the parent dialog read current YAML on cancel without re-rendering. */
export type TemplateFormPanelHandle = {
  getCurrentYaml: () => string;
  isDirty: () => boolean;
};

/** Parent request to overwrite a slot value; bump `requestId` to re-trigger even when slotId/value are unchanged. */
export type ApplySlotValueRequest = {
  slotId: string;
  value: string;
  requestId: number;
};

export type TemplateFormPanelProps = {
  template: PipelineTemplate;
  // Lets an out-of-tree submit button target the form via the `form` attribute.
  formId: string;
  onSubmit: (payload: TemplateFormSubmitPayload) => void;
  // When set, secret slots delegate "Create secret" to the parent instead of a nested dialog.
  onRequestCreateSecret?: (slotId: string, suggestedName: string | undefined) => void;
  // When set, topic slots delegate "Create topic" to the parent.
  onRequestCreateTopic?: (slotId: string) => void;
  // Writes `value` into the named slot once per `requestId`, then calls `onSlotValueApplied`.
  applySlotValue?: ApplySlotValueRequest | null;
  onSlotValueApplied?: () => void;
};

export const TemplateFormPanel = forwardRef<TemplateFormPanelHandle, TemplateFormPanelProps>(
  (
    { template, formId, onSubmit, onRequestCreateSecret, onRequestCreateTopic, applySlotValue, onSlotValueApplied },
    ref
  ) => {
    const { components, isLoading: isComponentsLoading } = useEnrichedComponents();
    const effectiveSlots = useMemo(
      () => applySchemaToSlots(template, components.length > 0 ? components : undefined),
      [template, components]
    );

    const schema = useMemo(() => buildSchema(effectiveSlots), [effectiveSlots]);
    const defaultValues = useMemo(() => defaultValuesFor(template, effectiveSlots), [template, effectiveSlots]);

    const form = useForm<FormValues>({
      resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
      defaultValues: defaultValues as FormValues,
      mode: 'onBlur',
    });

    // Schema-driven defaults can arrive after mount; reapply once per template, but only while pristine.
    const lastAppliedTemplateId = useRef<string | null>(null);
    useEffect(() => {
      // Wait for the config schema too (isLoading), so the one-shot reset uses schema-exact
      // required-ness/defaults rather than locking in values derived from proto flags alone.
      if (isComponentsLoading || components.length === 0 || lastAppliedTemplateId.current === template.id) {
        return;
      }
      lastAppliedTemplateId.current = template.id;
      if (!form.formState.isDirty) {
        form.reset(defaultValues as FormValues);
      }
    }, [isComponentsLoading, components, defaultValues, form, template.id]);

    const stitchCurrentYaml = (values: FormValues): string => {
      const { [PIPELINE_NAME_FIELD]: pipelineName, ...slotValues } = values;
      return stitchTemplateYaml({
        template,
        values: slotValues as Record<string, string>,
        pipelineName: pipelineName?.trim() || template.defaultPipelineName,
      });
    };

    useImperativeHandle(ref, () => ({
      getCurrentYaml: () => stitchCurrentYaml(form.getValues()),
      isDirty: () => form.formState.isDirty,
    }));

    // Apply an externally-requested slot write (e.g. from the in-dialog secret step).
    // biome-ignore lint/correctness/useExhaustiveDependencies: requestId is the intentional change detector; slotId/value are read fresh from applySlotValue and shouldn't refire repeats.
    useEffect(() => {
      if (!applySlotValue) {
        return;
      }
      form.setValue(applySlotValue.slotId, applySlotValue.value, { shouldDirty: true, shouldValidate: true });
      onSlotValueApplied?.();
    }, [applySlotValue?.requestId, form, onSlotValueApplied]);

    const sections = groupSlotsBySection(effectiveSlots);

    const submitHandler = form.handleSubmit((values) => {
      onSubmit({
        pipelineName: values[PIPELINE_NAME_FIELD] ?? template.defaultPipelineName,
        yaml: stitchCurrentYaml(values),
      });
    });

    return (
      <Form {...form}>
        <form
          className="flex flex-col gap-12 pb-4"
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
            const endpoint = endpointFor(section, template);
            return (
              <section
                aria-labelledby={`section-${section}`}
                className="flex flex-col gap-4"
                data-testid={`template-section-${section}`}
                key={section}
              >
                <div className="flex flex-wrap items-center gap-2.5 border-divider-default border-b pb-2.5">
                  <h5 className="font-bold text-heading-xs uppercase tracking-wider" id={`section-${section}`}>
                    {SECTION_LABELS[section]}
                  </h5>
                  {endpoint ? <EndpointBadge endpoint={endpoint} /> : null}
                </div>
                {slots.map((slot) => {
                  switch (slot.kind) {
                    case 'string':
                      return <StringSlotField control={form.control} key={slot.id} slot={slot} />;
                    case 'select':
                      return <SelectSlotField control={form.control} key={slot.id} slot={slot} />;
                    case 'topic':
                      return (
                        <TopicSlotField
                          control={form.control}
                          key={slot.id}
                          onRequestCreateTopic={onRequestCreateTopic}
                          slot={slot}
                        />
                      );
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
  }
);

TemplateFormPanel.displayName = 'TemplateFormPanel';
