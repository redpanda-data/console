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
  Button,
  CloseButton,
  Flex,
  FormField,
  Heading,
  IconButton,
  Input,
  RadioGroup,
  Text,
  useToast,
} from '@redpanda-data/ui';
import { useQueryClient } from '@tanstack/react-query';
import { TrashIcon } from 'components/icons';
import { InfoIcon } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { openSwitchSchemaFormatModal, openValidationErrorsModal } from './modals';
import { useSchemaTypesQuery } from '../../../react-query/api/schema-registry';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import {
  type SchemaRegistryValidateSchemaResponse,
  SchemaType,
  type SchemaTypeType,
} from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import KowlEditor from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { Switch } from '../../redpanda-ui/components/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
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
  references: { name: string; subject: string; version: number }[];
  normalize: boolean;
  metadataProperties: { key: string; value: string }[];
};

type SchemaEditorStateHelper = SchemaEditorStateData & {
  computedMetadata: { properties: Record<string, string> } | undefined;
  isInvalidKeyOrValue: boolean;
  computedSubjectName: string;
};

type SetSchemaState = Dispatch<SetStateAction<SchemaEditorStateData>>;

function createInitialSchemaState(): SchemaEditorStateData {
  return {
    strategy: 'TOPIC',
    userInput: '',
    keyOrValue: undefined,
    format: 'AVRO',
    schemaText: exampleSchema.AVRO,
    references: [{ name: '', subject: '', version: 1 }],
    normalize: false,
    metadataProperties: [{ key: '', value: '' }],
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
  if (state.strategy !== 'CUSTOM' && state.keyOrValue !== undefined) {
    subjectName += `-${state.keyOrValue.toLowerCase()}`;
  }

  return { ...state, computedMetadata, isInvalidKeyOrValue, computedSubjectName: subjectName };
}

export class SchemaCreatePage extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Create schema';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    p.addBreadcrumb('Create schema', '/schema-registry');
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaSubjects(force); // for references editor -> subject selector
    api.refreshTopics(force); // for the topics selector
  }

  render() {
    return <SchemaCreatePageContent />;
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

const SchemaCreatePageContent = () => {
  const [stateData, setStateData] = useState<SchemaEditorStateData>(createInitialSchemaState);
  const state = deriveSchemaEditorState(stateData);

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

    const metadataProperties: { key: string; value: string }[] = schema.metadata?.properties
      ? [...Object.entries(schema.metadata.properties).map(([key, value]) => ({ key, value })), { key: '', value: '' }]
      : [{ key: '', value: '' }];

    queueMicrotask(() =>
      setStateData({
        strategy: 'CUSTOM',
        userInput: subject.name,
        keyOrValue: undefined,
        format: schema.type as 'AVRO' | 'PROTOBUF',
        schemaText,
        references: schema.references,
        normalize: false,
        metadataProperties,
      })
    );
  }, [subject, stateData]);

  if (!subject || stateData === null) return DefaultSkeleton;

  const state = deriveSchemaEditorState(stateData);
  const setNonNullStateData = setStateData as SetSchemaState;

  return (
    <PageContent key="b">
      <Heading data-testid="schema-add-version-heading" variant="xl">
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
  const { editorState } = p;
  const isMissingName = !editorState.computedSubjectName;

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
          data-testid="schema-create-save-btn"
          isDisabled={isCreating || isMissingName || isValidating || editorState.isInvalidKeyOrValue}
          isLoading={isCreating}
          loadingText="Creating..."
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
              const subjectName = editorState.computedSubjectName;
              await api
                .createSchema(editorState.computedSubjectName, {
                  schemaType: editorState.format as SchemaTypeType,
                  schema: editorState.schemaText,
                  references: editorState.references.filter((x) => x.name && x.subject),
                  metadata: editorState.computedMetadata,
                  params: {
                    normalize: editorState.normalize,
                  },
                })
                .finally(() => setCreating(false));

              await api.refreshSchemaDetails(subjectName, true);

              // Invalidate React Query cache so details page shows latest data
              await queryClient.invalidateQueries({
                queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
              });

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
          variant="solid"
        >
          Save
        </Button>

        <Button
          data-testid="schema-create-validate-btn"
          isDisabled={isValidating || isMissingName || isValidating || editorState.isInvalidKeyOrValue}
          isLoading={isValidating}
          loadingText="Validate"
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
          variant="outline"
        >
          Validate
        </Button>

        <Button
          data-testid="schema-create-cancel-btn"
          onClick={() => {
            if (p.parentSubjectName) {
              appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(p.parentSubjectName)}`);
            } else {
              appGlobal.historyReplace('/schema-registry');
            }
          }}
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
    .validateSchema(state.computedSubjectName, 'latest', {
      schemaType: state.format as SchemaTypeType,
      schema: state.schemaText,
      references: state.references.filter((x) => x.name && x.subject),
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

  useEffect(() => {
    api.refreshSchemaTypes(true);
  }, []);

  const { state, mode } = p;
  const isAddVersion = mode === 'ADD_VERSION';

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
      <Heading variant="lg">Settings</Heading>

      {Boolean(isAddVersion) && (
        <Alert status="info">
          <AlertIcon />
          When adding a new schema version, the only thing that can be changed is the schema definition and its
          references. The rest of the fields have been disabled.
        </Alert>
      )}

      <Flex direction="column" gap="8" maxWidth="650px">
        <Flex gap="8">
          <FormField label="Strategy">
            <SingleSelect<NamingStrategy>
              data-testid="schema-create-strategy-select"
              isDisabled={isAddVersion}
              onChange={(e) => {
                p.onStateChange((prev) => ({ ...prev, userInput: '', strategy: e }));
              }}
              options={[
                { value: 'TOPIC', label: 'Topic Name' },
                { value: 'RECORD_NAME', label: 'Record Name' },
                { value: 'TOPIC_RECORD_NAME', label: 'Topic-Record Name' },
                { value: 'CUSTOM', label: 'Custom' },
              ]}
              value={state.strategy}
            />
          </FormField>

          {showTopicNameInput ? (
            <FormField label="Topic name">
              <SingleSelect
                data-testid="schema-create-topic-select"
                isDisabled={isAddVersion}
                onChange={(e) => {
                  p.onStateChange((prev) => ({ ...prev, userInput: e }));
                }}
                options={
                  api.topics?.filter((x) => !x.topicName.startsWith('_')).map((x) => ({ value: x.topicName })) ?? []
                }
                value={state.userInput}
              />
            </FormField>
          ) : (
            // We don't want "Strategy" to expand
            <Box width="100%" />
          )}
        </Flex>

        <Flex gap="8">
          <FormField errorText="Required" isInvalid={state.isInvalidKeyOrValue} label="Key or value" width="auto">
            <Box data-testid="schema-create-key-value-radio">
              <RadioGroup
                isDisabled={isAddVersion}
                name="keyOrValue"
                onChange={(e) => {
                  p.onStateChange((prev) => ({ ...prev, keyOrValue: e as 'KEY' | 'VALUE' }));
                }}
                options={[
                  { value: 'KEY', label: 'Key' },
                  { value: 'VALUE', label: 'Value' },
                ]}
                value={state.keyOrValue}
              />
            </Box>
          </FormField>

          <FormField
            errorText="Subject name is required"
            isInvalid={!state.computedSubjectName}
            label={isCustom ? 'Subject name' : 'Computed subject name'}
          >
            <Input
              data-testid="schema-create-subject-name-input"
              isDisabled={!isCustom || isAddVersion}
              onChange={(e) => {
                p.onStateChange((prev) => ({ ...prev, userInput: e.target.value }));
              }}
              value={state.computedSubjectName}
            />
          </FormField>
        </Flex>
      </Flex>

      <Heading mt="8" variant="lg">
        Schema definition
      </Heading>

      <Flex direction="column" gap="4" maxWidth="1000px">
        <FormField label="Format">
          <Box data-testid="schema-create-format-radio">
            <RadioGroup
              isDisabled={isAddVersion}
              name="format"
              onChange={(e) => {
                if (state.format === e) {
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
              options={formatOptions}
              value={state.format}
            />
          </Box>
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

        <Heading mt="8" variant="lg">
          Schema references
        </Heading>
        {/* <Text>This is an example help text about the references list, to be updated later</Text> */}

        <ReferencesEditor onStateChange={p.onStateChange} state={state} />

        <Heading mt="8" variant="lg">
          Schema metadata
        </Heading>
        <Text>
          Optional key-value properties to associate with this schema. Metadata will be ignored if not supported by
          schema registry.
        </Text>

        <MetadataPropertiesEditor onStateChange={p.onStateChange} state={state} />
      </Flex>
    </>
  );
};

const ReferencesEditor = (p: { state: SchemaEditorStateHelper; onStateChange: SetSchemaState }) => {
  const refs = p.state.references;

  const renderRow = (ref: (typeof refs)[number], index: number) => (
    <Flex alignItems="flex-end" gap="4" key={index}>
      <FormField label="Schema reference">
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
      <FormField label="Subject">
        <SingleSelect
          data-testid={`schema-create-reference-subject-select-${index}`}
          onChange={async (e) => {
            p.onStateChange((prev) => ({
              ...prev,
              references: prev.references.map((r, i) => (i === index ? { ...r, subject: e } : r)),
            }));

            let details = api.schemaDetails.get(e);
            if (!details) {
              await api.refreshSchemaDetails(e, true);
              details = api.schemaDetails.get(e);
            }

            if (!details) {
              return; // failed to get details
            }

            p.onStateChange((prev) => {
              const r = prev.references[index];
              // Need to make sure that, after refreshing, the subject is still the same
              // otherwise, when the user switches between subjects very quickly, we might refresh 3 subjectDetails,
              // and when the first one completes, we're setting its latest version, which now isn't valid for the outdated subject
              if (r?.subject !== e) return prev;
              return {
                ...prev,
                references: prev.references.map((r, i) =>
                  i === index ? { ...r, version: details.latestActiveVersion } : r
                ),
              };
            });
          }}
          options={api.schemaSubjects?.filter((x) => !x.isSoftDeleted).map((x) => ({ value: x.name })) ?? []}
          value={ref.subject}
        />
      </FormField>
      <FormField label="Version">
        <SingleSelect<number>
          data-testid={`schema-create-reference-version-select-${index}`}
          onChange={(e) => {
            p.onStateChange((prev) => ({
              ...prev,
              references: prev.references.map((r, i) => (i === index ? { ...r, version: e } : r)),
            }));
          }}
          options={
            api.schemaDetails
              .get(ref.subject)
              ?.versions.filter((v) => !v.isSoftDeleted)
              ?.map((x) => ({ value: x.version })) ?? []
          }
          value={ref.version}
        />
      </FormField>
      <IconButton
        aria-label="delete"
        data-testid={`schema-create-reference-delete-btn-${index}`}
        icon={<TrashIcon fontSize="19px" />}
        onClick={() => {
          p.onStateChange((prev) => ({
            ...prev,
            references: prev.references.filter((_, i) => i !== index),
          }));
        }}
        variant="ghost"
      />
    </Flex>
  );

  return (
    <Flex direction="column" gap="4">
      {refs.map((x, index) => renderRow(x, index))}

      <Button
        data-testid="schema-create-add-reference-btn"
        onClick={() => {
          p.onStateChange((prev) => ({
            ...prev,
            references: [...prev.references, { name: '', subject: '', version: 1 }],
          }));
        }}
        size="sm"
        variant="outline"
        width="fit-content"
      >
        Add reference
      </Button>
    </Flex>
  );
};

const MetadataPropertiesEditor = (p: { state: SchemaEditorStateHelper; onStateChange: SetSchemaState }) => {
  const props = p.state.metadataProperties;

  const renderRow = (prop: { key: string; value: string }, index: number) => (
    <Flex alignItems="flex-end" gap="4" key={index}>
      <FormField label="Key">
        <Input
          data-testid={`schema-create-metadata-key-input-${index}`}
          onChange={(e) => {
            p.onStateChange((prev) => ({
              ...prev,
              metadataProperties: prev.metadataProperties.map((mp, i) =>
                i === index ? { ...mp, key: e.target.value } : mp
              ),
            }));
          }}
          placeholder="e.g. owner"
          value={prop.key}
        />
      </FormField>
      <FormField label="Value">
        <Input
          data-testid={`schema-create-metadata-value-input-${index}`}
          onChange={(e) => {
            p.onStateChange((prev) => ({
              ...prev,
              metadataProperties: prev.metadataProperties.map((mp, i) =>
                i === index ? { ...mp, value: e.target.value } : mp
              ),
            }));
          }}
          placeholder="e.g. team-platform"
          value={prop.value}
        />
      </FormField>
      <IconButton
        aria-label="delete"
        data-testid={`schema-create-metadata-delete-btn-${index}`}
        icon={<TrashIcon fontSize="19px" />}
        onClick={() => {
          p.onStateChange((prev) => ({
            ...prev,
            metadataProperties: prev.metadataProperties.filter((_, i) => i !== index),
          }));
        }}
        variant="ghost"
      />
    </Flex>
  );

  return (
    <Flex direction="column" gap="4">
      {props.map((x, index) => renderRow(x, index))}

      <Button
        data-testid="schema-create-add-metadata-btn"
        onClick={() => {
          p.onStateChange((prev) => ({
            ...prev,
            metadataProperties: [...prev.metadataProperties, { key: '', value: '' }],
          }));
        }}
        size="sm"
        variant="outline"
        width="fit-content"
      >
        Add property
      </Button>
    </Flex>
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
