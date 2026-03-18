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

'use no memo';

import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  CloseButton,
  Flex,
  FormField,
  IconButton,
  useToast,
} from '@redpanda-data/ui';
import { useQueryClient } from '@tanstack/react-query';
import { TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { Input } from 'components/redpanda-ui/components/input';
import { KeyValueField } from 'components/redpanda-ui/components/key-value-field';
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
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { InfoIcon } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';

import { ContextsNotSupportedPage } from './contexts-not-supported-page';
import { openSwitchSchemaFormatModal, openValidationErrorsModal } from './modals';
import {
  ALL_CONTEXT_ID,
  buildQualifiedReferences,
  buildQualifiedSubjectName,
  contextIdToLabel,
  contextLabelToId,
  contextNameToId,
  deriveContexts,
  isNamedContext,
  parseSubjectContext,
} from './schema-context-utils';
import {
  useListSchemasQuery,
  useSchemaRegistryContextsQuery,
  useSchemaTypesQuery,
} from '../../../react-query/api/schema-registry';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import {
  type SchemaRegistryValidateSchemaResponse,
  SchemaType,
  type SchemaTypeType,
} from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import KowlEditor from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

// Regex for extracting record names from schema text
const JSON_NAME_REGEX = /"name"\s*:\s*"(.*)"/;
const PROTOBUF_MESSAGE_NAME_REGEX = /message\s+(\S+)\s*\{/;

type NamingStrategy =
  | 'TOPIC' // only topic name
  | 'RECORD_NAME' // take name from the record
  | 'TOPIC_RECORD_NAME' // both topic and record name
  | 'CUSTOM'; // essentially no strategy / arbitrary name

type SchemaEditorStateData = {
  strategy: NamingStrategy;
  userInput: string; // holds either topicName or custom input
  keyOrValue: 'KEY' | 'VALUE' | undefined;
  format: 'AVRO' | 'PROTOBUF' | 'JSON';
  schemaText: string;
  references: { id: string; name: string; subject: string; version: number; context: string }[];
  normalize: boolean;
  metadataProperties: { id: string; key: string; value: string }[];
  context: string;
};

type SchemaEditorStateHelper = SchemaEditorStateData & {
  computedMetadata: { properties: Record<string, string> } | undefined;
  isInvalidKeyOrValue: boolean;
  computedSubjectName: string;
  qualifiedSubjectName: string;
};

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function computeRecordName(state: SchemaEditorStateData): string {
  if (state.format === 'AVRO' || state.format === 'JSON') {
    try {
      const obj = JSON.parse(state.schemaText);
      const name = obj.name;
      return name;
    } catch {
      // no op - schema may be incomplete during editing
    }
    const ar = JSON_NAME_REGEX.exec(state.schemaText);
    if (!ar) return '';
    if (ar.length < 2) return '';
    return ar[1];
  }
  const ar = PROTOBUF_MESSAGE_NAME_REGEX.exec(state.schemaText);
  if (!ar) return '';
  if (ar.length < 2) return '';
  return ar[1];
}

function deriveSchemaEditorState(state: SchemaEditorStateData): SchemaEditorStateHelper {
  const properties: Record<string, string> = {};
  for (const prop of state.metadataProperties) {
    if (prop.key && prop.value) {
      properties[prop.key] = prop.value;
    }
  }
  const computedMetadata = Object.keys(properties).length > 0 ? { properties } : undefined;

  const isInvalidKeyOrValue = state.strategy === 'TOPIC' && state.userInput.length > 0 && !state.keyOrValue;

  const recordName = computeRecordName(state);
  let subjectName = '';
  if (state.strategy === 'TOPIC') {
    subjectName = state.userInput;
  } else if (state.strategy === 'RECORD_NAME') {
    subjectName = recordName;
  } else if (state.strategy === 'TOPIC_RECORD_NAME') {
    subjectName = `${state.userInput}-${recordName}`;
  } else {
    subjectName = state.userInput;
  }
  if (state.strategy !== 'CUSTOM' && state.keyOrValue !== undefined && subjectName) {
    subjectName += `-${state.keyOrValue.toLowerCase()}`;
  }

  const qualifiedSubjectName = buildQualifiedSubjectName(state.context, subjectName);

  return { ...state, computedMetadata, isInvalidKeyOrValue, computedSubjectName: subjectName, qualifiedSubjectName };
}

export class SchemaCreatePage extends PageComponent<{ contextName?: string }> {
  initPage(p: PageInitHelper): void {
    p.title = 'Create schema';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    const contextName = this.props.contextName ? decodeURIComponent(this.props.contextName) : undefined;
    if (contextName) {
      p.addBreadcrumb('Create schema', `/schema-registry/contexts/${encodeURIComponent(contextName)}/create`);
    } else {
      p.addBreadcrumb('Create schema', '/schema-registry/create');
    }
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaSubjects(force); // for references editor -> subject selector
    api.refreshTopics(force); // for the topics selector
  }

  render() {
    return (
      <SchemaCreatePageContent
        contextName={this.props.contextName ? decodeURIComponent(this.props.contextName) : undefined}
      />
    );
  }
}

export class SchemaAddVersionPage extends PageComponent<{ subjectName: string }> {
  initPage(p: PageInitHelper): void {
    const subjectName = this.props.subjectName;
    p.title = 'Add schema version';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    p.addBreadcrumb(subjectName, `/schema-registry/subjects/${subjectName}`, undefined, {
      canBeTruncated: true,
    });
    p.addBreadcrumb('Create schema', `/schema-registry/subjects/${subjectName}/add-version`);
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig();
    api.refreshSchemaMode();
    api.refreshSchemaSubjects(force);
    api.refreshSchemaTypes(force);

    const subjectName = decodeURIComponent(this.props.subjectName);
    api.refreshSchemaDetails(subjectName, force);
  }

  render() {
    return <SchemaAddVersionPageContent subjectName={decodeURIComponent(this.props.subjectName)} />;
  }
}

const SchemaCreatePageContent = ({ contextName }: { contextName?: string }) => {
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const [stateData, setStateData] = useState<SchemaEditorStateData>(() => {
    const initial = createInitialSchemaState();
    if (contextName) {
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

  if (contextName && !srContextsEnabled) {
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
  const subject = api.schemaDetails.get(subjectName);

  useEffect(() => {
    if (!subject || stateData !== null) return;

    const schema = subject.schemas.first((x) => x.version === subject.latestActiveVersion);
    if (!schema) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('Cannot find last active schema version of subject', {
        name: subject.name,
        lastActiveVersion: subject.latestActiveVersion,
        schemas: subject.schemas,
      });
      return;
    }

    const schemaText =
      schema.type === SchemaType.AVRO || schema.type === SchemaType.JSON
        ? JSON.stringify(JSON.parse(schema.schema), undefined, 4)
        : schema.schema;

    const metadataProperties: SchemaEditorStateData['metadataProperties'] = schema.metadata?.properties
      ? [
          ...Object.entries(schema.metadata.properties).map(([key, value]) => ({
            id: crypto.randomUUID(),
            key,
            value,
          })),
          { id: crypto.randomUUID(), key: '', value: '' },
        ]
      : [{ id: crypto.randomUUID(), key: '', value: '' }];

    let userInput: string;
    let contextId: string;
    if (srContextsEnabled) {
      const parsed = parseSubjectContext(subject.name);
      contextId = contextNameToId(parsed.context);
      userInput = parsed.displayName;
    } else {
      contextId = '';
      userInput = subject.name;
    }

    queueMicrotask(() =>
      setStateData({
        strategy: 'CUSTOM',
        userInput,
        keyOrValue: undefined,
        format: schema.type as 'AVRO' | 'PROTOBUF',
        schemaText,
        references: schema.references.map((r) => ({ ...r, id: crypto.randomUUID(), context: contextId })),
        normalize: false,
        metadataProperties,
        context: contextId,
      })
    );
  }, [subject, stateData]);

  if (!subject || stateData === null) return DefaultSkeleton;

  const state = deriveSchemaEditorState(stateData);
  const setNonNullStateData = setStateData as SetSchemaState;

  return (
    <PageContent key="b">
      <Heading level={1} testId="schema-add-version-heading">
        Add schema version
      </Heading>

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
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isValidating, setValidating] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [persistentValidationError, setPersistentValidationError] = useState<{
    isValid: boolean;
    errorDetails?: string;
    isCompatible?: boolean;
    compatibilityError?: { errorType: string; description: string };
  } | null>(null);
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const { editorState } = p;
  const isMissingName = !editorState.computedSubjectName;
  const isMissingContext = srContextsEnabled && !editorState.context;

  return (
    <>
      {persistentValidationError ? (
        <Alert data-testid="schema-create-validation-error-alert" mb="4" mt="4" status="error" variant="left-accent">
          <AlertIcon />
          <Box flex="1">
            <AlertTitle alignItems="center" display="flex">
              {persistentValidationError.compatibilityError?.errorType
                ? persistentValidationError.compatibilityError.errorType.replace(/_/g, ' ')
                : 'Schema Validation Error'}
            </AlertTitle>
            <AlertDescription display="block" mt="2">
              {persistentValidationError.compatibilityError?.description ||
                persistentValidationError.errorDetails ||
                'Schema validation failed'}
            </AlertDescription>
          </Box>
          <CloseButton
            alignSelf="flex-start"
            data-testid="schema-create-error-close-btn"
            onClick={() => setPersistentValidationError(null)}
            position="relative"
            right={-1}
            top={-1}
          />
        </Alert>
      ) : null}

      <Flex gap="4" mt="4">
        <Button
          disabled={isCreating || isMissingName || isMissingContext || isValidating || editorState.isInvalidKeyOrValue}
          onClick={async () => {
            // We must validate first, "create" does not properly check and just gives internal server error if anything is wrong with the schema
            setValidating(true);
            const validationResponse = await validateSchema(editorState).finally(() => setValidating(false));

            if (!validationResponse.isValid || validationResponse.isCompatible === false) {
              // Something is wrong with the schema, abort
              // Persist error only after user closes the modal
              openValidationErrorsModal(validationResponse, () => {
                setPersistentValidationError(validationResponse);
              });
              return;
            }

            // Clear any previous validation errors
            setPersistentValidationError(null);

            // try to create the schema
            setCreating(true);
            try {
              const subjectName = editorState.qualifiedSubjectName;
              await api
                .createSchema(subjectName, {
                  schemaType: editorState.format as SchemaTypeType,
                  schema: editorState.schemaText,
                  references: buildQualifiedReferences(editorState.references, editorState.context),
                  metadata: editorState.computedMetadata,
                  params: {
                    normalize: editorState.normalize,
                  },
                })
                .finally(() => setCreating(false));

              await Promise.all([
                api.refreshSchemaDetails(subjectName, true),
                // Invalidate React Query cache so details page shows latest data
                queryClient.invalidateQueries({
                  queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
                }),
              ]);

              // success: navigate to details with "latest" so it picks up the new version
              appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=latest`);
            } catch (err) {
              toast({
                status: 'error',
                duration: undefined,
                isClosable: true,
                title: 'Error creating schema',
                description: String(err),
              });
            }
          }}
          testId="schema-create-save-btn"
          variant="primary"
        >
          {isCreating ? 'Creating...' : 'Save'}
        </Button>

        <Button
          disabled={isValidating || isMissingName || isMissingContext || editorState.isInvalidKeyOrValue}
          onClick={async () => {
            setValidating(true);
            const r = await validateSchema(editorState).finally(() => setValidating(false));

            if (r.isValid && r.isCompatible !== false) {
              // Clear any previous validation errors on successful validation
              setPersistentValidationError(null);
              toast({
                status: 'success',
                duration: 4000,
                isClosable: false,
                title: 'Schema validated successfully',
              });
            } else {
              // Persist error only after user closes the modal
              openValidationErrorsModal(r, () => {
                setPersistentValidationError(r);
              });
            }
          }}
          testId="schema-create-validate-btn"
          variant="outline"
        >
          {isValidating ? 'Validating...' : 'Validate'}
        </Button>

        <Button
          onClick={() => {
            if (p.parentSubjectName) {
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
      </Flex>
    </>
  );
};

async function validateSchema(state: SchemaEditorStateHelper): Promise<{
  isValid: boolean; // is the schema valid at all (can be parsed, no unknown types etc)
  errorDetails?: string; // details about why the schema is not valid
  isCompatible?: boolean; // is the new schema not compatible with older versions; only set when the schema is valid
  compatibilityError?: { errorType: string; description: string }; // detailed compatibility error from schema registry
}> {
  if (!state.computedSubjectName) {
    return { isValid: false, errorDetails: 'Missing subject name' };
  }

  const r = await api
    .validateSchema(state.qualifiedSubjectName, 'latest', {
      schemaType: state.format as SchemaTypeType,
      schema: state.schemaText,
      references: buildQualifiedReferences(state.references, state.context),
    })
    .catch(
      (err) =>
        ({
          compatibility: { isCompatible: false },
          isValid: false,
          parsingError: String(err),
        }) as SchemaRegistryValidateSchemaResponse
    );

  return {
    isValid: r.isValid,
    errorDetails: r.parsingError,
    isCompatible: r.isValid ? r.compatibility.isCompatible : undefined,
    compatibilityError: r.compatibility.error,
  };
}

const SchemaEditor = (p: {
  state: SchemaEditorStateHelper;
  mode: 'CREATE' | 'ADD_VERSION';
  onStateChange: SetSchemaState;
}) => {
  const { data: schemaTypes } = useSchemaTypesQuery();
  const srContextsEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const { data: apiContexts } = useSchemaRegistryContextsQuery(srContextsEnabled);
  const { data: subjects } = useListSchemasQuery();

  useEffect(() => {
    api.refreshSchemaTypes(true);
  }, []);

  const { state, mode } = p;
  const isAddVersion = mode === 'ADD_VERSION';
  const [contextWarning, setContextWarning] = useState('');

  const availableContexts = useMemo(() => {
    if (!(srContextsEnabled && apiContexts && subjects)) return [];
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

  const showTopicNameInput = state.strategy === 'TOPIC' || state.strategy === 'TOPIC_RECORD_NAME';
  const isCustom = state.strategy === 'CUSTOM';

  const formatOptions = [
    { value: 'AVRO', label: 'Avro' },
    { value: 'PROTOBUF', label: 'Protobuf' },
  ];

  if (schemaTypes?.includes('JSON') || api.schemaTypes?.includes('JSON')) {
    formatOptions.push({ value: 'JSON', label: 'JSON' });
  }

  return (
    <>
      <Heading level={2}>Subject Settings</Heading>

      {Boolean(isAddVersion) && (
        <Alert status="info">
          <AlertIcon />
          When adding a new schema version, the only thing that can be changed is the schema definition and its
          references. The rest of the fields have been disabled.
        </Alert>
      )}

      <Flex direction="column" gap="8" maxWidth="650px">
        {srContextsEnabled && !isAddVersion && (
          <FormField
            description="Select an existing context or type a new name to create one."
            errorText="Context is required"
            isInvalid={!state.context}
            label="Context"
          >
            <Combobox
              creatable
              createLabel="context"
              onChange={(value) => {
                const contextId = contextLabelToId(value);
                setContextWarning('');
                p.onStateChange((prev) => ({
                  ...prev,
                  context: contextId,
                  references: prev.references.map((r) => ({ ...r, context: contextId })),
                }));
              }}
              onCreateOption={(value) => {
                if (value.startsWith('.')) {
                  setContextWarning('');
                } else {
                  setContextWarning('Context name must start with a dot (e.g. ".staging")');
                }
              }}
              options={contextOptions}
              placeholder="Select or create a context..."
              testId="schema-create-context-select"
              value={contextIdToLabel(state.context)}
            />
            {contextWarning && (
              <Text className="mt-1 text-destructive" variant="bodyMedium">
                {contextWarning}
              </Text>
            )}
          </FormField>
        )}

        {srContextsEnabled && isAddVersion && (
          <FormField label="Context">
            <Input disabled value={contextIdToLabel(state.context) || 'None'} />
          </FormField>
        )}

        <FormField label="Strategy">
          <Select
            disabled={isAddVersion}
            onValueChange={(e) => {
              p.onStateChange((prev) => ({ ...prev, userInput: '', strategy: e as NamingStrategy }));
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
        </FormField>

        {showTopicNameInput && (
          <FormField errorText="Topic name is required" isInvalid={!state.userInput} label="Topic name">
            <Select
              disabled={isAddVersion}
              onValueChange={(e) => {
                p.onStateChange((prev) => ({ ...prev, userInput: e }));
              }}
              value={state.userInput}
            >
              <SelectTrigger data-testid="schema-create-topic-select">
                <SelectValue placeholder="Select a topic..." />
              </SelectTrigger>
              <SelectContent>
                {(api.topics?.filter((x) => !x.topicName.startsWith('_')) ?? []).map((x) => (
                  <SelectItem key={x.topicName} value={x.topicName}>
                    {x.topicName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        {!isCustom && (
          <FormField
            errorText="Required"
            footerDescription="Determines whether this schema is registered for the topic's key or value messages."
            isInvalid={state.isInvalidKeyOrValue}
            label="Schema applies to"
            width="auto"
          >
            <RadioGroup
              className="mt-3 w-fit"
              data-testid="schema-create-key-value-radio"
              disabled={isAddVersion}
              onValueChange={(e) => {
                p.onStateChange((prev) => ({ ...prev, keyOrValue: e as 'KEY' | 'VALUE' }));
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
          </FormField>
        )}

        {isCustom && (
          <FormField errorText="Subject name is required" isInvalid={!state.computedSubjectName} label="Subject name">
            <Input
              disabled={isAddVersion}
              onChange={(e) => {
                p.onStateChange((prev) => ({ ...prev, userInput: e.target.value }));
              }}
              testId="schema-create-subject-name-input"
              value={state.computedSubjectName}
            />
          </FormField>
        )}

        {!isCustom && state.computedSubjectName && (
          <>
            <Separator />
            <div className="flex flex-col gap-0.5">
              <Text className="uppercase" variant="labelStrongXSmall">
                Subject name
              </Text>
              <Text className="font-mono" variant="bodyMedium">
                {state.computedSubjectName}
              </Text>
            </div>
          </>
        )}

        {srContextsEnabled &&
          state.qualifiedSubjectName &&
          state.qualifiedSubjectName !== state.computedSubjectName && (
            <div className="flex flex-col gap-0.5">
              <Text className="uppercase" variant="labelStrongXSmall">
                Qualified subject name
              </Text>
              <Text className="font-mono" variant="bodyMedium">
                {isNamedContext(state.context) ? (
                  <>
                    <Text as="span" className="font-mono text-gray-400" variant="bodyMedium">
                      :{state.context}:
                    </Text>
                    <Text as="span" className="font-mono" variant="bodyMedium">
                      {state.computedSubjectName}
                    </Text>
                  </>
                ) : (
                  state.qualifiedSubjectName
                )}
              </Text>
            </div>
          )}
      </Flex>

      <Heading className="mt-8" level={2}>
        Schema definition
      </Heading>

      <Flex direction="column" gap="4" maxWidth="1000px">
        <FormField label="Format">
          <ToggleGroup
            className="w-fit divide-x divide-border p-0"
            data-testid="schema-create-format-radio"
            disabled={isAddVersion}
            onValueChange={(e) => {
              if (!e || state.format === e) {
                return;
              }
              // Let user confirm
              openSwitchSchemaFormatModal(() => {
                p.onStateChange((prev) => ({
                  ...prev,
                  format: e as 'AVRO' | 'PROTOBUF' | 'JSON',
                  schemaText: exampleSchema[e as SchemaTypeType],
                }));
              });
            }}
            transition={{ duration: 0 }}
            type="single"
            value={state.format}
            variant="outline"
          >
            {formatOptions.map((opt) => (
              <ToggleGroupItem className="px-4" disabled={isAddVersion} key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FormField>

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

        <Flex alignItems="center" gap="3">
          <Flex alignItems="center" gap="2">
            <span className="font-semibold">Normalize schema</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 cursor-help text-gray-500" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  When enabled, the schema will be normalized to a canonical form before registration, reducing
                  duplicate schema versions
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Flex>
          <Switch
            checked={state.normalize}
            onCheckedChange={(checked) => {
              p.onStateChange((prev) => ({ ...prev, normalize: checked === true }));
            }}
          />
        </Flex>

        <Heading className="mt-8" level={2}>
          Schema references
        </Heading>
        <Text>
          Link other schemas that this schema depends on. References allow schemas to reuse types defined in other
          subjects.
        </Text>

        <ReferencesEditor
          contextSelectOptions={contextSelectOptions}
          onStateChange={p.onStateChange}
          parentContext={state.context}
          srContextsEnabled={srContextsEnabled}
          state={state}
        />

        <Heading className="mt-8" level={2}>
          Schema metadata
        </Heading>
        <Text className="w-1/2">
          Optional key-value properties to associate with this schema. Metadata will be ignored if not supported by
          schema registry.
        </Text>
        <MetadataPropertiesEditor onStateChange={p.onStateChange} state={state} />
      </Flex>
    </>
  );
};

const ReferencesEditor = (p: {
  state: SchemaEditorStateHelper;
  onStateChange: SetSchemaState;
  srContextsEnabled: boolean;
  parentContext: string;
  contextSelectOptions: { value: string; label: string }[];
}) => {
  const refs = p.state.references;

  const subjectsByContext = useMemo(() => {
    const allSubjects = api.schemaSubjects?.filter((x) => !x.isSoftDeleted) ?? [];
    if (!p.srContextsEnabled) return new Map([['__all__', allSubjects.map((x) => ({ value: x.name }))]]);

    const map = new Map<string, { value: string }[]>();
    for (const s of allSubjects) {
      const parsed = parseSubjectContext(s.name);
      const key = contextNameToId(parsed.context);
      const list = map.get(key) ?? [];
      list.push({ value: parsed.displayName });
      map.set(key, list);
    }
    return map;
  }, [p.srContextsEnabled, api.schemaSubjects]);

  const getSubjectsForContext = (contextId: string) => {
    if (!p.srContextsEnabled) return subjectsByContext.get('__all__') ?? [];
    return subjectsByContext.get(contextId) ?? [];
  };

  const renderRow = (ref: (typeof refs)[number], index: number) => {
    const refQualified =
      p.srContextsEnabled && ref.context !== p.parentContext
        ? buildQualifiedSubjectName(ref.context, ref.subject)
        : null;

    return (
      <Flex direction="column" gap="2" key={ref.id}>
        <Flex alignItems="flex-end" gap="4">
          <FormField label="Schema reference name">
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
          </FormField>
          {p.srContextsEnabled && (
            <FormField label="Context">
              <Select
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
            </FormField>
          )}
          <FormField label="Subject">
            <Select
              onValueChange={async (e) => {
                p.onStateChange((prev) => ({
                  ...prev,
                  references: prev.references.map((r, i) => (i === index ? { ...r, subject: e } : r)),
                }));

                // For fetching details, we need the qualified name
                const qualifiedRefSubject = buildQualifiedSubjectName(ref.context, e);
                let details = api.schemaDetails.get(qualifiedRefSubject);
                if (!details) {
                  await api.refreshSchemaDetails(qualifiedRefSubject, true);
                  details = api.schemaDetails.get(qualifiedRefSubject);
                }

                if (!details) {
                  return; // failed to get details
                }

                p.onStateChange((prev) => {
                  const r = prev.references[index];
                  // Need to make sure that, after refreshing, the subject is still the same
                  if (r?.subject !== e) return prev;
                  return {
                    ...prev,
                    references: prev.references.map((r, i) =>
                      i === index ? { ...r, version: details.latestActiveVersion } : r
                    ),
                  };
                });
              }}
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
          </FormField>
          <FormField label="Version">
            <Select
              onValueChange={(e) => {
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
          </FormField>
          <IconButton
            aria-label="delete"
            data-testid={`schema-create-reference-delete-btn-${index}`}
            flexShrink={0}
            icon={<TrashIcon size="12px" />}
            onClick={() => {
              p.onStateChange((prev) => ({
                ...prev,
                references: prev.references.filter((_, i) => i !== index),
              }));
            }}
            variant="ghost"
          />
        </Flex>
        {refQualified && (
          <Text className="ml-1 font-mono text-muted-foreground" variant="bodySmall">
            Reference subject: {refQualified}
          </Text>
        )}
      </Flex>
    );
  };

  return (
    <Flex direction="column" gap="4">
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
    </Flex>
  );
};

const MetadataPropertiesEditor = (p: { state: SchemaEditorStateHelper; onStateChange: SetSchemaState }) => {
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

const exampleSchema: Record<SchemaTypeType, string> = {
  AVRO: `
{
   "type": "record",
   "name": "car",
   "fields": [
      {
         "name": "model",
         "type": "string"
      },
      {
         "name": "make",
         "type": "string"
      },
      {
         "name": "year",
         "type": "float"
      }
   ]
}
`.trim(),

  PROTOBUF: `
syntax = "proto3";

message Car {
   string make = 1;
   string model = 2;
   int32 year = 3;
}
`.trim(),

  JSON: `
    {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    }
  },
  "required": ["name"],
  "additionalProperties": false
}
    `.trim(),
} as const;
