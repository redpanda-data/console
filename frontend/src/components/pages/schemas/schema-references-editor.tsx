import { TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Field, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { KeyValueField } from 'components/redpanda-ui/components/key-value-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { type Dispatch, type SetStateAction, useMemo } from 'react';
import { asyncEvent } from 'utils/async-event';
import { reportActionError } from 'utils/toast.utils';

import { buildQualifiedSubjectName } from './schema-context-utils';
import {
  type SchemaEditorStateData,
  type SchemaEditorStateHelper,
  subjectOptionsByContext,
} from './schema-create-state';
import { api, useApiStoreHook } from '../../../state/backend-api';
import { isNonEmptyString } from '../../../utils/string-utils';

type SetSchemaState = Dispatch<SetStateAction<SchemaEditorStateData>>;

export const ReferencesEditor = (p: {
  state: SchemaEditorStateHelper;
  onStateChange: SetSchemaState;
  srContextsEnabled: boolean;
  parentContext: string;
  contextSelectOptions: {
    value: string;
    label: string;
  }[];
}) => {
  const refs = p.state.references;
  // Subscribed, so the subject options follow the list as it loads.
  const schemaSubjects = useApiStoreHook((s) => s.schemaSubjects);

  const subjectsByContext = useMemo(() => {
    const allSubjects = schemaSubjects?.filter((x) => !x.isSoftDeleted) ?? [];
    if (!p.srContextsEnabled) {
      return new Map([['__all__', allSubjects.map((x) => ({ value: x.name }))]]);
    }
    return subjectOptionsByContext(allSubjects);
  }, [p.srContextsEnabled, schemaSubjects]);

  const getSubjectsForContext = (contextId: string) => {
    if (!p.srContextsEnabled) {
      return subjectsByContext.get('__all__') ?? [];
    }
    return subjectsByContext.get(contextId) ?? [];
  };

  const renderRow = (ref: (typeof refs)[number], index: number) => {
    const refQualified =
      p.srContextsEnabled && ref.context !== p.parentContext
        ? buildQualifiedSubjectName(ref.context, ref.subject)
        : null;

    return (
      <div className="flex flex-col gap-2" key={ref.id}>
        <div className="flex items-end gap-4">
          <Field>
            <FieldLabel>Schema reference name</FieldLabel>
            <Input
              data-testid={`schema-create-reference-name-input-${index}`}
              onChange={(e) => {
                p.onStateChange((prev) => ({
                  ...prev,
                  references: prev.references.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)),
                }));
              }}
              value={ref.name}
            />
          </Field>
          {p.srContextsEnabled && (
            <Field>
              <FieldLabel>Context</FieldLabel>
              <Select
                items={p.contextSelectOptions}
                onValueChange={(contextId) => {
                  p.onStateChange((prev) => ({
                    ...prev,
                    references: prev.references.map((r, i) =>
                      i === index ? { ...r, context: contextId, subject: '' } : r
                    ),
                  }));
                }}
                value={ref.context}
              >
                <SelectTrigger data-testid={`schema-create-reference-context-select-${index}`}>
                  <SelectValue placeholder="Context..." />
                </SelectTrigger>
                <SelectContent>
                  {p.contextSelectOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel>Subject</FieldLabel>
            <Select
              onValueChange={asyncEvent(async (e) => {
                p.onStateChange((prev) => ({
                  ...prev,
                  references: prev.references.map((r, i) => (i === index ? { ...r, subject: e } : r)),
                }));

                // For fetching details, we need the qualified name
                const qualifiedRefSubject = buildQualifiedSubjectName(ref.context, e);
                if (!api.schemaDetails.get(qualifiedRefSubject)) {
                  await api.refreshSchemaDetails(qualifiedRefSubject, true);
                }
                const details = api.schemaDetails.get(qualifiedRefSubject);

                if (!details) {
                  return; // failed to get details
                }

                p.onStateChange((prev) => {
                  const r = prev.references[index];
                  // Need to make sure that, after refreshing, the subject is still the same
                  if (r?.subject !== e) {
                    return prev;
                  }
                  return {
                    ...prev,
                    references: prev.references.map((reference, i) =>
                      i === index ? { ...reference, version: details.latestActiveVersion } : reference
                    ),
                  };
                });
              }, reportActionError)}
              value={ref.subject}
            >
              <SelectTrigger data-testid={`schema-create-reference-subject-select-${index}`}>
                <SelectValue placeholder="Select a subject..." />
              </SelectTrigger>
              <SelectContent>
                {getSubjectsForContext(ref.context).map((x) => (
                  <SelectItem key={x.value} value={x.value}>
                    {x.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Version</FieldLabel>
            <Select
              onValueChange={(e: unknown) => {
                if (typeof e !== 'string' || !Number.isInteger(Number(e))) {
                  return;
                }
                p.onStateChange((prev) => ({
                  ...prev,
                  references: prev.references.map((r, i) => (i === index ? { ...r, version: Number(e) } : r)),
                }));
              }}
              value={String(ref.version)}
            >
              <SelectTrigger data-testid={`schema-create-reference-version-select-${index}`}>
                <SelectValue placeholder="Version" />
              </SelectTrigger>
              <SelectContent>
                {(
                  api.schemaDetails
                    .get(buildQualifiedSubjectName(ref.context, ref.subject))
                    ?.versions.filter((v) => !v.isSoftDeleted) ?? []
                ).map((x) => (
                  <SelectItem key={x.version} value={String(x.version)}>
                    {x.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            aria-label="delete"
            className="shrink-0"
            onClick={() => {
              p.onStateChange((prev) => ({
                ...prev,
                references: prev.references.filter((_, i) => i !== index),
              }));
            }}
            size="icon-sm"
            testId={`schema-create-reference-delete-btn-${index}`}
            variant="ghost"
          >
            <TrashIcon />
          </Button>
        </div>
        {isNonEmptyString(refQualified) && (
          <div className="ml-1 font-mono text-body-sm text-muted-foreground">Reference subject: {refQualified}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {refs.map((x, index) => renderRow(x, index))}

      <Button
        className="w-fit"
        onClick={() => {
          p.onStateChange((prev) => ({
            ...prev,
            references: [
              ...prev.references,
              { id: crypto.randomUUID(), name: '', subject: '', version: 1, context: p.parentContext },
            ],
          }));
        }}
        size="sm"
        testId="schema-create-add-reference-btn"
        variant="outline"
      >
        Add reference
      </Button>
    </div>
  );
};

export const MetadataPropertiesEditor = (p: { state: SchemaEditorStateHelper; onStateChange: SetSchemaState }) => {
  const pairs = p.state.metadataProperties.map(({ key, value }) => ({ key, value }));

  return (
    <div className="w-1/2">
      <KeyValueField
        addButtonLabel="Add property"
        keyFieldProps={{ placeholder: 'e.g. owner' }}
        onChange={(updated) => {
          p.onStateChange((prev) => ({
            ...prev,
            metadataProperties: updated.map((pair, i) => ({
              id: prev.metadataProperties[i]?.id ?? crypto.randomUUID(),
              ...pair,
            })),
          }));
        }}
        testId="schema-create-metadata"
        value={pairs}
        valueFieldProps={{ placeholder: 'e.g. team-platform' }}
      />
    </div>
  );
};
