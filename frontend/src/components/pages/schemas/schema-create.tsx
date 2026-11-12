import { FenceGuardedButton } from 'components/cluster-fence/fence-guarded-controls';

import { exampleSchema } from './schema-examples';
import { MetadataPropertiesEditor, ReferencesEditor } from './schema-references-editor';
/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Switch } from 'components/redpanda-ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { AlertCircle, InfoIcon, X } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { asyncEvent } from 'utils/async-event';
import { reportActionError } from 'utils/toast.utils';

import { ContextsNotSupportedPage } from './contexts-not-supported-page';
import { SwitchSchemaFormatDialog, ValidationErrorsDialog } from './modals';
import {
  ALL_CONTEXT_ID,
  buildQualifiedReferences,
  contextIdToLabel,
  contextLabelToId,
  contextNameToId,
  deriveContexts,
  isNamedContext,
} from './schema-context-utils';
import {
  addVersionEditorState,
  deriveSchemaEditorState,
  type SchemaEditorStateData,
  type SchemaEditorStateHelper,
} from './schema-create-state';
import {
  useListSchemasQuery,
  useSchemaRegistryContextsQuery,
  useSchemaTypesQuery,
} from '../../../react-query/api/schema-registry';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { SchemaRegistryValidateSchemaResponse, SchemaTypeType } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { arrayFirst } from '../../../utils/array-utils';
import { isNonEmptyString } from '../../../utils/string-utils';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { KowlEditor } from '../../misc/kowl-editor';
import { PageContent } from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';
import { TonedIcon } from '../shared/toned-icon';

type SetSchemaState = Dispatch<SetStateAction<SchemaEditorStateData>>;

function createInitialSchemaState(): SchemaEditorStateData {
  return {
    strategy: 'TOPIC',
    userInput: '',
    keyOrValue: undefined,
    format: 'AVRO',
    schemaText: exampleSchema.AVRO,
    references: [{ id: crypto.randomUUID(), name: '', subject: '', version: 1, context: '' }],
    normalize: false,
    metadataProperties: [{ id: crypto.randomUUID(), key: '', value: '' }],
    context: '',
  };
}
export class SchemaCreatePage extends PageComponent<{
  contextName?: string;
}> {
  initPage(p: PageInitHelper): void {
    p.title = 'Create schema';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    const contextName = isNonEmptyString(this.props.contextName)
      ? decodeURIComponent(this.props.contextName)
      : undefined;
    if (contextName !== null && contextName !== undefined && contextName !== '') {
      p.addBreadcrumb('Create schema', `/schema-registry/contexts/${encodeURIComponent(contextName)}/create`);
    } else {
      p.addBreadcrumb('Create schema', '/schema-registry/create');
    }
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaSubjects(force); // for references editor -> subject selector
    api.refreshTopics(force).catch(reportActionError); // for the topics selector
  }

  render() {
    return (
      <SchemaCreatePageContent
        contextName={isNonEmptyString(this.props.contextName) ? decodeURIComponent(this.props.contextName) : undefined}
      />
    );
  }
}
export class SchemaAddVersionPage extends PageComponent<{
  subjectName: string;
}> {
  initPage(p: PageInitHelper): void {
    const subjectName = decodeURIComponent(this.props.subjectName);
    const encodedSubjectName = encodeURIComponent(subjectName);
    p.title = 'Add schema version';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    p.addBreadcrumb(subjectName, `/schema-registry/subjects/${encodedSubjectName}`, undefined, {
      canBeTruncated: true,
    });
    p.addBreadcrumb('Create schema', `/schema-registry/subjects/${encodedSubjectName}/add-version`);
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig().catch(reportActionError);
    api.refreshSchemaMode().catch(reportActionError);
    api.refreshSchemaSubjects(force);
    api.refreshSchemaTypes(force);

    const subjectName = decodeURIComponent(this.props.subjectName);
    api.refreshSchemaDetails(subjectName, force).catch(reportActionError);
  }

  render() {
    return <SchemaAddVersionPageContent subjectName={decodeURIComponent(this.props.subjectName)} />;
  }
}

const SchemaCreatePageContent = ({ contextName }: { contextName?: string }) => {
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const [stateData, setStateData] = useState<SchemaEditorStateData>(() => {
    const initial = createInitialSchemaState();
    if (contextName !== null && contextName !== undefined && contextName !== '') {
      const contextId = contextNameToId(contextName);
      return {
        ...initial,
        context: contextId,
        references: [{ id: crypto.randomUUID(), name: '', subject: '', version: 1, context: contextId }],
      };
    }
    return initial;
  });
  const state = deriveSchemaEditorState(stateData);

  if (contextName !== null && contextName !== undefined && contextName !== '' && !srContextsEnabled) {
    return <ContextsNotSupportedPage />;
  }

  return (
    <PageContent key="b">
      <SchemaEditor mode="CREATE" onStateChange={setStateData} state={state} />
      <SchemaPageButtons editorState={state} />
    </PageContent>
  );
};

const SchemaAddVersionPageContent = ({ subjectName }: { subjectName: string }) => {
  const [stateData, setStateData] = useState<SchemaEditorStateData | null>(null);
  const subject = useApiStoreHook((s) => s.schemaDetails.get(subjectName));
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);

  useEffect(() => {
    if (!subject || stateData !== null) {
      return;
    }
    const schema = arrayFirst(subject.schemas, (x) => x.version === subject.latestActiveVersion);
    if (!schema) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('Cannot find last active schema version of subject', {
        name: subject.name,
        lastActiveVersion: subject.latestActiveVersion,
        schemas: subject.schemas,
      });
      return;
    }

    const nextState = addVersionEditorState(subject.name, schema, srContextsEnabled);
    queueMicrotask(() => setStateData(nextState));
  }, [subject, stateData, srContextsEnabled]);

  if (!subject || stateData === null) {
    return DefaultSkeleton;
  }

  const state = deriveSchemaEditorState(stateData);
  const setNonNullStateData: SetSchemaState = (update) =>
    setStateData((prev) => (prev === null ? prev : typeof update === 'function' ? update(prev) : update));

  return (
    <PageContent key="b">
      <SchemaEditor mode="ADD_VERSION" onStateChange={setNonNullStateData} state={state} />

      <SchemaPageButtons editorState={state} parentSubjectName={subjectName} />
    </PageContent>
  );
};

/*
    This component is about the "Save", "Validate", and "Cancel" buttons at the bottom of the page.
    Those buttons are shared across both page variants, thus it was extracted into its own component
 */
const SchemaPageButtons = (p: {
  parentSubjectName?: string; // cancel button needs to know where to navigate to; was the page reached though 'New schema' or 'Add version'?
  editorState: SchemaEditorStateHelper;
}) => {
  const queryClient = useQueryClient();
  const [isValidating, setValidating] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [persistentValidationError, setPersistentValidationError] = useState<{
    isValid: boolean;
    errorDetails?: string;
    isCompatible?: boolean;
    compatibilityError?: {
      errorType: string;
      description: string;
    };
  } | null>(null);
  const [validationDialogResult, setValidationDialogResult] = useState<typeof persistentValidationError>(null);
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const { editorState } = p;
  const isMissingName = !editorState.computedSubjectName;
  const isMissingContext = srContextsEnabled && !editorState.context;

  return (
    <>
      {persistentValidationError ? (
        <Alert
          className="my-4"
          icon={<AlertCircle />}
          testId="schema-create-validation-error-alert"
          variant="destructive"
        >
          <AlertTitle>
            {isNonEmptyString(persistentValidationError.compatibilityError?.errorType)
              ? persistentValidationError.compatibilityError.errorType.replace(/_/g, ' ')
              : 'Schema Validation Error'}
          </AlertTitle>
          <AlertDescription>
            {(persistentValidationError.compatibilityError?.description ?? '') ||
              (persistentValidationError.errorDetails ?? '') ||
              'Schema validation failed'}
          </AlertDescription>
          <Button
            aria-label="Close"
            className="absolute top-2 right-2"
            onClick={() => setPersistentValidationError(null)}
            size="icon-xs"
            testId="schema-create-error-close-btn"
            variant="ghost"
          >
            <X />
          </Button>
        </Alert>
      ) : null}
      <div className="mt-4 flex gap-4">
        <FenceGuardedButton
          action="editSchemas"
          disabled={isCreating || isMissingName || isMissingContext || isValidating || editorState.isInvalidKeyOrValue}
          onClick={asyncEvent(async () => {
            // We must validate first, "create" does not properly check and just gives internal server error if anything is wrong with the schema
            setValidating(true);
            const validationResponse = await validateSchema(editorState).finally(() => setValidating(false));

            if (!validationResponse.isValid || validationResponse.isCompatible === false) {
              // Something is wrong with the schema, abort
              // Persist error only after user closes the modal
              setValidationDialogResult(validationResponse);
              return;
            }

            // Clear any previous validation errors
            setPersistentValidationError(null);

            // try to create the schema
            setCreating(true);
            await createSchemaAndOpen(editorState, queryClient, () => setCreating(false));
          }, reportActionError)}
          testId="schema-create-save-btn"
          variant="primary"
        >
          {isCreating ? 'Creating...' : 'Save'}
        </FenceGuardedButton>

        <Button
          disabled={isValidating || isMissingName || isMissingContext || editorState.isInvalidKeyOrValue}
          onClick={asyncEvent(async () => {
            setValidating(true);
            const r = await validateSchema(editorState).finally(() => setValidating(false));

            if (r.isValid && r.isCompatible !== false) {
              // Clear any previous validation errors on successful validation
              setPersistentValidationError(null);
              toast.success('Schema validated');
            } else {
              // Persist error only after user closes the modal
              setValidationDialogResult(r);
            }
          }, reportActionError)}
          testId="schema-create-validate-btn"
          variant="outline"
        >
          {isValidating ? 'Validating...' : 'Validate'}
        </Button>

        <Button
          onClick={() => {
            if (isNonEmptyString(p.parentSubjectName)) {
              appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(p.parentSubjectName)}`);
            } else {
              appGlobal.historyReplace('/schema-registry');
            }
          }}
          testId="schema-create-cancel-btn"
          variant="link"
        >
          Cancel
        </Button>
      </div>
      <ValidationErrorsDialog
        onClose={() => {
          if (validationDialogResult) {
            setPersistentValidationError(validationDialogResult);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setValidationDialogResult(null);
          }
        }}
        open={validationDialogResult !== null}
        result={validationDialogResult}
      />
    </>
  );
};

// Registers the schema, refreshes its cached details, and opens the subject at
// its latest version; `onSettled` runs once the create request settles.
async function createSchemaAndOpen(
  editorState: SchemaEditorStateHelper,
  queryClient: QueryClient,
  onSettled: () => void
): Promise<void> {
  try {
    const subjectName = editorState.qualifiedSubjectName;
    await api
      .createSchema(subjectName, {
        schemaType: editorState.format,
        schema: editorState.schemaText,
        references: buildQualifiedReferences(editorState.references, editorState.context),
        metadata: editorState.computedMetadata,
        params: {
          normalize: editorState.normalize,
        },
      })
      .finally(onSettled);

    await Promise.all([
      api.refreshSchemaDetails(subjectName, true),
      // Invalidate React Query cache so details page shows latest data
      queryClient.invalidateQueries({
        queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
      }),
    ]);

    // success: navigate to details with "latest" so it picks up the new version
    appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=latest`);
  } catch (error) {
    toast.error('Error creating schema', { description: String(error) });
  }
}

async function validateSchema(state: SchemaEditorStateHelper): Promise<{
  isValid: boolean; // is the schema valid at all (can be parsed, no unknown types etc)
  errorDetails?: string; // details about why the schema is not valid
  isCompatible?: boolean; // is the new schema not compatible with older versions; only set when the schema is valid
  compatibilityError?: {
    errorType: string;
    description: string;
  }; // detailed compatibility error from schema registry
}> {
  if (!state.computedSubjectName) {
    return { isValid: false, errorDetails: 'Missing subject name' };
  }

  const r: SchemaRegistryValidateSchemaResponse = await api
    .validateSchema(state.qualifiedSubjectName, 'latest', {
      schemaType: state.format,
      schema: state.schemaText,
      references: buildQualifiedReferences(state.references, state.context),
    })
    .catch((error: unknown) => ({
      compatibility: { isCompatible: false },
      isValid: false,
      parsingError: String(error),
    }));

  return {
    isValid: r.isValid,
    errorDetails: r.parsingError,
    isCompatible: r.isValid ? r.compatibility.isCompatible : undefined,
    compatibilityError: r.compatibility.error,
  };
}

const BASE_FORMAT_OPTIONS = [
  { value: 'AVRO', label: 'Avro' },
  { value: 'PROTOBUF', label: 'Protobuf' },
];
const JSON_FORMAT_OPTION = { value: 'JSON', label: 'JSON' };

// Schema formats the registry accepts; JSON only when it reports support for it.
function useSchemaFormatOptions() {
  const { data: schemaTypes } = useSchemaTypesQuery();

  useEffect(() => {
    api.refreshSchemaTypes(true);
  }, []);

  const supportsJson = (schemaTypes?.includes('JSON') ?? false) || api.schemaTypes?.includes('JSON');
  return supportsJson === true ? [...BASE_FORMAT_OPTIONS, JSON_FORMAT_OPTION] : BASE_FORMAT_OPTIONS;
}

// Existing contexts (without the synthetic "All"), as options keyed by label
// for the context combobox and by id for the reference context selects.
function useSchemaEditorContexts(srContextsEnabled: boolean) {
  const { data: apiContexts } = useSchemaRegistryContextsQuery(srContextsEnabled);
  const { data: subjects } = useListSchemasQuery();

  const availableContexts = useMemo(() => {
    if (!(srContextsEnabled && apiContexts && subjects)) {
      return [];
    }
    return deriveContexts(apiContexts, subjects).filter((c) => c.id !== ALL_CONTEXT_ID);
  }, [srContextsEnabled, apiContexts, subjects]);

  const contextOptions = useMemo(
    () => availableContexts.map((c) => ({ value: c.label, label: c.label })),
    [availableContexts]
  );

  const contextSelectOptions = useMemo(
    () => availableContexts.map((c) => ({ value: c.id, label: c.label })),
    [availableContexts]
  );

  return { contextOptions, contextSelectOptions };
}

// Switching format replaces the schema text, so a picked format waits for confirmation.
function useFormatSwitch(currentFormat: string, onStateChange: SetSchemaState) {
  const [switchFormatOpen, setSwitchFormatOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<SchemaTypeType | null>(null);

  return {
    switchFormatOpen,
    setSwitchFormatOpen,
    requestFormat: (format: string | undefined) => {
      if (!(format !== null && format !== undefined && format !== '') || currentFormat === format) {
        return;
      }
      // Let user confirm
      if (format !== 'AVRO' && format !== 'PROTOBUF' && format !== 'JSON') {
        return;
      }
      setPendingFormat(format);
      setSwitchFormatOpen(true);
    },
    confirmFormat: () => {
      if (pendingFormat !== null) {
        onStateChange((prev) => ({
          ...prev,
          format: pendingFormat,
          schemaText: exampleSchema[pendingFormat],
        }));
        setPendingFormat(null);
      }
    },
  };
}

// Context picker for a new subject: pick an existing context or create one.
function ContextField({
  state,
  onStateChange,
  contextOptions,
  showRequired,
  onTouched,
}: {
  state: SchemaEditorStateHelper;
  onStateChange: SetSchemaState;
  contextOptions: {
    value: string;
    label: string;
  }[];
  showRequired: boolean;
  onTouched: () => void;
}) {
  const [contextWarning, setContextWarning] = useState('');

  return (
    <Field data-invalid={showRequired || undefined}>
      <FieldLabel>Context</FieldLabel>
      <FieldDescription>Select an existing context or type a new name to create one.</FieldDescription>
      <Combobox
        // index.scss's base `svg` rule offsets the icons.
        className="[&_svg]:block!"
        creatable
        createLabel="context"
        onChange={(value) => {
          const contextId = contextLabelToId(value);
          onTouched();
          setContextWarning('');
          onStateChange((prev) => ({
            ...prev,
            context: contextId,
            references: prev.references.map((r) => ({ ...r, context: contextId })),
          }));
        }}
        onCreateOption={(value) => {
          if (value.startsWith('.')) {
            setContextWarning('');
          } else {
            setContextWarning('Context name must start with a dot (for example, ".staging")');
          }
        }}
        options={contextOptions}
        placeholder="Select or create a context..."
        testId="schema-create-context-select"
        value={contextIdToLabel(state.context)}
      />
      {contextWarning && <div className="mt-1 text-body text-destructive">{contextWarning}</div>}
      {showRequired && <FieldError>Context is required</FieldError>}
    </Field>
  );
}

const SchemaTopicName = ({
  state,
  touched,
  isAddVersion,
  onTouched,
  onStateChange,
}: {
  state: SchemaEditorStateHelper;
  touched: boolean;
  isAddVersion: boolean;
  onTouched: () => void;
  onStateChange: SetSchemaState;
}) => (
  <Field data-invalid={(touched && !state.userInput) || undefined}>
    <FieldLabel>Topic name</FieldLabel>
    <Select
      disabled={isAddVersion}
      onValueChange={(value) => {
        onTouched();
        onStateChange((prev) => ({ ...prev, userInput: value }));
      }}
      value={state.userInput}
    >
      <SelectTrigger data-testid="schema-create-topic-select">
        <SelectValue placeholder="Select a topic..." />
      </SelectTrigger>
      <SelectContent>
        {(api.topics?.filter((topic) => !topic.topicName.startsWith('_')) ?? []).map((topic) => (
          <SelectItem key={topic.topicName} value={topic.topicName}>
            {topic.topicName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {touched && !state.userInput && <FieldError>Topic name is required</FieldError>}
  </Field>
);

const SchemaEditor = (p: {
  state: SchemaEditorStateHelper;
  mode: 'CREATE' | 'ADD_VERSION';
  onStateChange: SetSchemaState;
}) => {
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const formatOptions = useSchemaFormatOptions();
  const { contextOptions, contextSelectOptions } = useSchemaEditorContexts(srContextsEnabled);

  const { state, mode } = p;
  const isAddVersion = mode === 'ADD_VERSION';
  const { switchFormatOpen, setSwitchFormatOpen, requestFormat, confirmFormat } = useFormatSwitch(
    state.format,
    p.onStateChange
  );
  // Only surface "required" errors after the user has interacted with a field, not on mount.
  const [touched, setTouched] = useState<{
    context: boolean;
    topic: boolean;
  }>({ context: false, topic: false });
  const showTopicNameInput = state.strategy === 'TOPIC' || state.strategy === 'TOPIC_RECORD_NAME';
  const isCustom = state.strategy === 'CUSTOM';

  return (
    <>
      <h2 className="text-heading-lg">Subject Settings</h2>
      {isAddVersion && (
        <Alert variant="informative">
          <AlertDescription>
            When adding a new schema version, the only thing that can be changed is the schema definition and its
            references. The rest of the fields have been disabled.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex max-w-[650px] flex-col gap-8">
        {srContextsEnabled && !isAddVersion && (
          <ContextField
            contextOptions={contextOptions}
            onStateChange={p.onStateChange}
            onTouched={() => setTouched((t) => ({ ...t, context: true }))}
            showRequired={touched.context && !state.context}
            state={state}
          />
        )}

        {srContextsEnabled && isAddVersion && (
          <Field>
            <FieldLabel>Context</FieldLabel>
            <Input disabled value={contextIdToLabel(state.context) || 'None'} />
          </Field>
        )}

        <SchemaNamingStrategy
          isAddVersion={isAddVersion}
          onStateChange={p.onStateChange}
          onStrategyTouched={() => setTouched((t) => ({ ...t, topic: false }))}
          state={state}
        />

        {showTopicNameInput && (
          <SchemaTopicName
            isAddVersion={isAddVersion}
            onStateChange={p.onStateChange}
            onTouched={() => setTouched((t) => ({ ...t, topic: true }))}
            state={state}
            touched={touched.topic}
          />
        )}

        {!isCustom && <SchemaKeyOrValue isAddVersion={isAddVersion} onStateChange={p.onStateChange} state={state} />}

        {isCustom && (
          <Field data-invalid={!state.computedSubjectName || undefined}>
            <FieldLabel>Subject name</FieldLabel>
            <Input
              disabled={isAddVersion}
              onChange={(e) => {
                p.onStateChange((prev) => ({ ...prev, userInput: e.target.value }));
              }}
              testId="schema-create-subject-name-input"
              value={state.computedSubjectName}
            />
            {!state.computedSubjectName && <FieldError>Subject name is required</FieldError>}
          </Field>
        )}

        <SchemaSubjectName showComputed={!isCustom} srContextsEnabled={srContextsEnabled} state={state} />
      </div>
      <h2 className="mt-8 text-heading-lg">Schema definition</h2>
      <div className="flex max-w-[1000px] flex-col gap-4">
        <Field>
          <FieldLabel>Format</FieldLabel>
          <ToggleGroup
            className="w-fit!"
            data-testid="schema-create-format-radio"
            disabled={isAddVersion}
            onValueChange={([e]) => requestFormat(e)}
            value={[state.format]}
            variant="outline"
          >
            {formatOptions.map((opt) => (
              <ToggleGroupItem disabled={isAddVersion} key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <div data-testid="schema-create-schema-editor">
          <KowlEditor
            height="400px"
            language={state.format === 'PROTOBUF' ? 'proto' : 'json'}
            onChange={(e) => {
              p.onStateChange((prev) => ({ ...prev, schemaText: e ?? '' }));
            }}
            value={state.schemaText}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Normalize schema</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<TonedIcon className="size-4 cursor-help" icon={InfoIcon} tone="muted" />} />
                <TooltipContent side="right">
                  When enabled, the schema will be normalized to a canonical form before registration, reducing
                  duplicate schema versions
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Switch
            checked={state.normalize}
            onCheckedChange={(checked) => {
              p.onStateChange((prev) => ({ ...prev, normalize: checked === true }));
            }}
          />
        </div>

        <h2 className="mt-8 text-heading-lg">Schema references</h2>
        <div className="text-body">
          Link other schemas that this schema depends on. References allow schemas to reuse types defined in other
          subjects.
        </div>

        <ReferencesEditor
          contextSelectOptions={contextSelectOptions}
          onStateChange={p.onStateChange}
          parentContext={state.context}
          srContextsEnabled={srContextsEnabled}
          state={state}
        />

        <h2 className="mt-8 text-heading-lg">Schema metadata</h2>
        <div className="w-1/2 text-body">
          Optional key-value properties to associate with this schema. Metadata will be ignored if not supported by
          Schema Registry.
        </div>
        <MetadataPropertiesEditor onStateChange={p.onStateChange} state={state} />
      </div>
      <SwitchSchemaFormatDialog onConfirm={confirmFormat} onOpenChange={setSwitchFormatOpen} open={switchFormatOpen} />
    </>
  );
};

function SchemaNamingStrategy({
  state,
  isAddVersion,
  onStateChange,
  onStrategyTouched,
}: {
  state: SchemaEditorStateHelper;
  isAddVersion: boolean;
  onStateChange: SetSchemaState;
  onStrategyTouched: () => void;
}) {
  return (
    <Field>
      <FieldLabel>Strategy</FieldLabel>
      <Select
        disabled={isAddVersion}
        items={{
          TOPIC: 'Topic Name',
          RECORD_NAME: 'Record Name',
          TOPIC_RECORD_NAME: 'Topic-Record Name',
          CUSTOM: 'Custom',
        }}
        onValueChange={(e: unknown) => {
          if (e !== 'TOPIC' && e !== 'RECORD_NAME' && e !== 'TOPIC_RECORD_NAME' && e !== 'CUSTOM') {
            return;
          }
          onStrategyTouched();
          onStateChange((prev) => ({ ...prev, userInput: '', strategy: e }));
        }}
        value={state.strategy}
      >
        <SelectTrigger data-testid="schema-create-strategy-select">
          <SelectValue placeholder="Select a strategy..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TOPIC">Topic Name</SelectItem>
          <SelectItem value="RECORD_NAME">Record Name</SelectItem>
          <SelectItem value="TOPIC_RECORD_NAME">Topic-Record Name</SelectItem>
          <SelectItem value="CUSTOM">Custom</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function SchemaSubjectName({
  state,
  showComputed,
  srContextsEnabled,
}: {
  state: SchemaEditorStateHelper;
  showComputed: boolean;
  srContextsEnabled: boolean;
}) {
  return (
    <>
      {' '}
      {showComputed && state.computedSubjectName && (
        <>
          <Separator />
          <div className="flex flex-col gap-0.5">
            <div className="text-body-sm font-medium uppercase">Subject name</div>
            <div className="font-mono text-body">{state.computedSubjectName}</div>
          </div>
        </>
      )}
      {srContextsEnabled && state.qualifiedSubjectName && state.qualifiedSubjectName !== state.computedSubjectName && (
        <div className="flex flex-col gap-0.5">
          <div className="text-body-sm font-medium uppercase">Qualified subject name</div>
          <div className="font-mono text-body">
            {isNamedContext(state.context) ? (
              <>
                <span className="font-mono text-body text-disabled">:{state.context}:</span>
                <span className="font-mono text-body">{state.computedSubjectName}</span>
              </>
            ) : (
              state.qualifiedSubjectName
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SchemaKeyOrValue({
  state,
  isAddVersion,
  onStateChange,
}: {
  state: SchemaEditorStateHelper;
  isAddVersion: boolean;
  onStateChange: SetSchemaState;
}) {
  return (
    <Field data-invalid={state.isInvalidKeyOrValue || undefined}>
      <FieldLabel>Schema applies to</FieldLabel>
      <RadioGroup
        className="mt-3 flex"
        data-testid="schema-create-key-value-radio"
        disabled={isAddVersion}
        onValueChange={(e: unknown) => {
          if (e !== 'KEY' && e !== 'VALUE') {
            return;
          }
          onStateChange((prev) => ({ ...prev, keyOrValue: e }));
        }}
        orientation="horizontal"
        value={state.keyOrValue}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem disabled={isAddVersion} id="key-or-value-key" value="KEY" />
          <Label htmlFor="key-or-value-key">Key</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem disabled={isAddVersion} id="key-or-value-value" value="VALUE" />
          <Label htmlFor="key-or-value-value">Value</Label>
        </div>
      </RadioGroup>
      <FieldDescription>
        Determines whether this schema is registered for the topic's key or value messages.
      </FieldDescription>
      {state.isInvalidKeyOrValue && <FieldError>Required</FieldError>}
    </Field>
  );
}
