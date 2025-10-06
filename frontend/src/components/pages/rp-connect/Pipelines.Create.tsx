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

import { create } from '@bufbuild/protobuf';
import type { Monaco } from '@monaco-editor/react';
import {
  Button,
  type CreateToastFnReturn,
  Flex,
  FormField,
  Input,
  NumberInput,
  useDisclosure,
  useToast,
} from '@redpanda-data/ui';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button as NewButton } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Link as UILink, Text as UIText } from 'components/redpanda-ui/components/typography';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { isFeatureFlagEnabled } from 'config';
import { useSessionStorage } from 'hooks/use-session-storage';
import { AlertCircle, PlusIcon } from 'lucide-react';
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import type { editor, IDisposable, languages } from 'monaco-editor';
import { PipelineCreateSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import React, { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { Link } from 'react-router-dom';
import { CONNECT_WIZARD_CONNECTOR_KEY, CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from 'state/connect/state';

import { extractLintHintsFromError, formatPipelineError } from './errors';
import { CreatePipelineSidebar } from './onboarding/create-pipeline-sidebar';
import { SecretsQuickAdd } from './secrets/Secrets.QuickAdd';
import { cpuToTasks, MAX_TASKS, MIN_TASKS, tasksToCPU } from './tasks';
import type { ConnectComponentType } from './types/schema';
import type { AddUserFormData, ConnectTilesFormData } from './types/wizard';
import { getConnectTemplate } from './utils/yaml';
import { appGlobal } from '../../../state/appGlobal';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';

const exampleContent = `
`;

@observer
class RpConnectPipelinesCreate extends PageComponent<Record<string, never>> {
  @observable fileName = '';
  @observable description = '';
  @observable tasks = MIN_TASKS;
  @observable editorContent = exampleContent;
  @observable isCreating = false;
  @observable secrets: string[] = [];
  @observable lintResults: Record<string, any> = {};
  // TODO: Actually show this within the pipeline create page
  @observable tags = {} as Record<string, string>;

  constructor(p: any) {
    super(p);
    makeObservable(this, undefined, { autoBind: true });
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Create Pipeline';
    p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
    p.addBreadcrumb('Create Pipeline', '');

    this.refreshData(true);
    // get secrets
    rpcnSecretManagerApi.refreshSecrets(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(_force: boolean) {
    pipelinesApi.refreshPipelines(_force);
  }

  handleWizardClick = () => {
    sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
    sessionStorage.removeItem(CONNECT_WIZARD_TOPIC_KEY);
    sessionStorage.removeItem(CONNECT_WIZARD_USER_KEY);
  };

  render() {
    if (!pipelinesApi.pipelines) return DefaultSkeleton;
    if (rpcnSecretManagerApi.secrets) {
      // inject secrets to editor
      this.secrets.updateWith(rpcnSecretManagerApi.secrets.map((value) => value.id));
    }
    const alreadyExists = pipelinesApi.pipelines.any((x) => x.id === this.fileName);
    const isNameEmpty = this.fileName.trim().length === 0;

    const CreateButton = () => {
      const toast = useToast();
      const enableRpcnTiles = isFeatureFlagEnabled('enableRpcnTiles');

      return (
        <Button
          isDisabled={alreadyExists || isNameEmpty || this.isCreating}
          isLoading={this.isCreating}
          loadingText="Creating..."
          onClick={action(() => this.createPipeline(enableRpcnTiles ? undefined : toast))}
          variant="solid"
        >
          Create
        </Button>
      );
    };

    return (
      <PageContent>
        <div className="my-2">
          <UIText>
            For help creating your pipeline,
            {isFeatureFlagEnabled('enableRpcnTiles') && (
              <>
                {' '}
                try the{' '}
                <UILink as={Link} onClick={this.handleWizardClick} to="/rp-connect/wizard">
                  wizard
                </UILink>
                ,{' '}
              </>
            )}
            see our{' '}
            <UILink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/" target="_blank">
              quickstart documentation
            </UILink>
            , our{' '}
            <UILink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/cookbooks/" target="_blank">
              library of examples
            </UILink>
            , or our{' '}
            <UILink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/components/catalog/" target="_blank">
              connector catalog
            </UILink>
            .
          </UIText>
        </div>

        <Flex flexDirection="column" gap={3}>
          <FormField errorText="Pipeline name is already in use" isInvalid={alreadyExists} label="Pipeline name">
            <Flex alignItems="center" gap="2">
              <Input
                data-testid="pipelineName"
                isRequired
                onChange={(x) => (this.fileName = x.target.value)}
                pattern="[a-zA-Z0-9_\-]+"
                placeholder="Enter a config name..."
                value={this.fileName}
                width={500}
              />
            </Flex>
          </FormField>
          <FormField label="Description">
            <Input
              data-testid="pipelineDescription"
              onChange={(x) => (this.description = x.target.value)}
              value={this.description}
              width={500}
            />
          </FormField>
          <FormField
            description="One compute unit is equivalent to 0.1 CPU and 400 MB of memory. This is enough to experiment with low-volume pipelines."
            label="Compute Units"
            w={500}
          >
            <NumberInput
              max={MAX_TASKS}
              maxWidth={150}
              min={MIN_TASKS}
              onChange={(e) => (this.tasks = Number(e ?? MIN_TASKS))}
              value={this.tasks}
            />
          </FormField>
        </Flex>

        <div className="mt-4">
          <PipelineEditor onChange={(x) => (this.editorContent = x)} secrets={this.secrets} yaml={this.editorContent} />
        </div>

        {isFeatureFlagEnabled('enableRpcnTiles') && this.lintResults && Object.keys(this.lintResults).length > 0 && (
          <div className="mt-4">
            <LintHintList lintHints={this.lintResults} />
          </div>
        )}

        <Flex alignItems="center" gap="4">
          <CreateButton />
          <Link to="/connect-clusters">
            <Button variant="link">Cancel</Button>
          </Link>
        </Flex>
      </PageContent>
    );
  }

  async createPipeline(toast?: CreateToastFnReturn) {
    this.isCreating = true;

    pipelinesApi
      .createPipeline(
        create(PipelineCreateSchema, {
          configYaml: this.editorContent,
          description: this.description,
          displayName: this.fileName,
          resources: {
            cpuShares: tasksToCPU(this.tasks) || '0',
            memoryShares: '0', // still required by API but unused
          },
          tags: {
            ...this.tags,
            __redpanda_cloud_pipeline_type: 'pipeline',
          },
        })
      )
      .then(
        action(async (r) => {
          if (toast) {
            toast({
              status: 'success',
              duration: 4000,
              isClosable: false,
              title: 'Pipeline created',
            });
            const retUnits = cpuToTasks(r.response?.pipeline?.resources?.cpuShares);
            if (retUnits && this.tasks !== retUnits) {
              toast({
                status: 'warning',
                duration: 6000,
                isClosable: false,
                title: `Pipeline has been resized to use ${retUnits} compute units`,
              });
            }
          } else {
            this.lintResults = {};
            sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
            sessionStorage.removeItem(CONNECT_WIZARD_TOPIC_KEY);
            sessionStorage.removeItem(CONNECT_WIZARD_USER_KEY);
          }

          await pipelinesApi.refreshPipelines(true);
          appGlobal.historyPush('/connect-clusters');
        })
      )
      .catch(
        action((err) => {
          if (toast) {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: 'Failed to create pipeline',
              description: formatPipelineError(err),
            });
          } else {
            this.lintResults = extractLintHintsFromError(err);
          }
        })
      )
      .finally(() => {
        this.isCreating = false;
      });
  }
}

export default RpConnectPipelinesCreate;

interface QuickActionsProps {
  editorInstance: editor.IStandaloneCodeEditor | null;
  resetAutocompleteSecrets: VoidFunction;
}

const QuickActions = ({ editorInstance, resetAutocompleteSecrets }: QuickActionsProps) => {
  const { isOpen: isAddSecretOpen, onOpen: openAddSecret, onClose: closeAddSecret } = useDisclosure();

  if (editorInstance === null) {
    return <div className="min-w-[300px]" />;
  }

  const onAddSecret = (secretNotation: string) => {
    const selection = editorInstance.getSelection();
    if (selection === null) return;
    const id = { major: 1, minor: 1 };
    const op = { identifier: id, range: selection, text: secretNotation, forceMoveMarkers: true };
    editorInstance.executeEdits('my-source', [op]);
    resetAutocompleteSecrets();
    closeAddSecret();
  };

  return (
    <div className="flex gap-3 flex-col">
      <Card>
        <CardHeader>
          <CardTitle>Variables</CardTitle>
          <CardDescription>Add a reference to a new or existing secret value, such as a key.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewButton onClick={openAddSecret} variant="secondary">
            <PlusIcon className="size-4" color="white" />
            Add Secrets
          </NewButton>
        </CardContent>
      </Card>
      <SecretsQuickAdd isOpen={isAddSecretOpen} onAdd={onAddSecret} onCloseAddSecret={closeAddSecret} />
    </div>
  );
};

const registerSecretsAutocomplete = async (
  monaco: Monaco,
  setSecretAutocomplete: Dispatch<SetStateAction<IDisposable | undefined>>
) => {
  await rpcnSecretManagerApi.refreshSecrets(true);
  const secrets = rpcnSecretManagerApi.secrets || [];
  const autocomplete = monaco.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: ['$'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const completeItems = secrets.map<languages.CompletionItem>((secret) => ({
        label: `{secrets.${secret.id}}`,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: `{secrets.${secret.id}}`,
        range: range,
      }));
      return {
        suggestions: completeItems,
      };
    },
  });
  setSecretAutocomplete(autocomplete);
};

export const PipelineEditor = observer(
  (p: {
    yaml: string;
    onChange?: (newYaml: string) => void;
    secrets?: string[];
    quickActions?: React.FunctionComponent;
    isDisabled?: boolean;
  }) => {
    const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);
    const [secretAutocomplete, setSecretAutocomplete] = useState<IDisposable | undefined>(undefined);
    const [monaco, setMonaco] = useState<Monaco | undefined>(undefined);
    const [persistedFormData, _] = useSessionStorage<Partial<ConnectTilesFormData>>(CONNECT_WIZARD_CONNECTOR_KEY, {});
    const enableRpcnTiles = isFeatureFlagEnabled('enableRpcnTiles');

    // Track actual editor content to keep sidebar in sync with editor's real state
    const [actualEditorContent, setActualEditorContent] = useState<string>('');

    const persistedConnectComponentTemplate = useMemo(() => {
      if (!(persistedFormData?.connectionName && persistedFormData?.connectionType)) {
        return undefined;
      }
      const template = getConnectTemplate({
        connectionName: persistedFormData?.connectionName,
        connectionType: persistedFormData?.connectionType,
        showOptionalFields: false,
      });
      return template;
    }, [persistedFormData.connectionName, persistedFormData.connectionType]);

    const yaml = useMemo(() => {
      return enableRpcnTiles && persistedConnectComponentTemplate ? persistedConnectComponentTemplate : p.yaml;
    }, [enableRpcnTiles, persistedConnectComponentTemplate, p.yaml]);

    const { data: secretsData, refetch: refetchSecrets } = useListSecretsQuery();
    const existingSecrets = useMemo(() => {
      if (!secretsData?.secrets) return [];
      return secretsData.secrets.map((secret) => secret?.id).filter(Boolean) as string[];
    }, [secretsData]);

    const detectedSecrets = useMemo(() => {
      try {
        const secretRefs = extractSecretReferences(yaml);
        return getUniqueSecretNames(secretRefs);
      } catch {
        return [];
      }
    }, [yaml]);

    const [wizardUserData] = useSessionStorage<AddUserFormData>(CONNECT_WIZARD_USER_KEY);

    const secretDefaultValues = useMemo(() => {
      if (!wizardUserData) return {};
      const values: Record<string, string> = {};
      if (wizardUserData.username) values.REDPANDA_USERNAME = wizardUserData.username;
      if (wizardUserData.password) values.REDPANDA_PASSWORD = wizardUserData.password;
      return values;
    }, [wizardUserData]);

    const handleAddConnector = (connectionName: string, connectionType: ConnectComponentType) => {
      if (!editorInstance) return;

      const currentValue = editorInstance.getValue();
      const mergedYaml = getConnectTemplate({
        connectionName,
        connectionType,
        showOptionalFields: false,
        existingYaml: currentValue,
      });

      if (!mergedYaml) return;

      editorInstance.setValue(mergedYaml);
    };

    useEffect(() => {
      return () => {
        if (secretAutocomplete) {
          // avoid duplicate secret autocomplete registration
          secretAutocomplete.dispose();
        }
      };
    }, [secretAutocomplete]);

    // Sync actual editor content with editor instance
    // This ensures sidebar always sees what's actually in the editor
    useEffect(() => {
      if (!editorInstance) return;

      // Read actual content from editor after mount
      const currentValue = editorInstance.getValue();
      setActualEditorContent(currentValue);

      // Also sync to parent if different
      if (currentValue !== p.yaml) {
        p.onChange?.(currentValue);
      }

      // Listen for content changes
      const disposable = editorInstance.onDidChangeModelContent(() => {
        const newValue = editorInstance.getValue();
        setActualEditorContent(newValue);
      });

      return () => disposable.dispose();
    }, [editorInstance, p.onChange, p.yaml]);

    return (
      <Tabs
        tabs={[
          {
            key: 'config',
            title: 'Configuration',
            content: () => (
              <div>
                {/* yaml editor */}
                <div className="min-h-[400px] flex gap-7">
                  <PipelinesYamlEditor
                    defaultPath="config.yaml"
                    defaultValue={yaml}
                    language="yaml"
                    onChange={(e) => {
                      if (e) p.onChange?.(e);
                    }}
                    onMount={async (editor, monacoInstance) => {
                      setEditorInstance(editor);
                      setMonaco(monacoInstance);
                      await registerSecretsAutocomplete(monacoInstance, setSecretAutocomplete);
                    }}
                    options={{
                      readOnly: p.isDisabled,
                    }}
                    path="config.yaml"
                  />

                  {!p.isDisabled &&
                    (enableRpcnTiles ? (
                      <CreatePipelineSidebar
                        detectedSecrets={detectedSecrets}
                        editorContent={actualEditorContent}
                        editorInstance={editorInstance}
                        existingSecrets={existingSecrets}
                        onAddConnector={handleAddConnector}
                        onSecretsCreated={refetchSecrets}
                        secretDefaultValues={secretDefaultValues}
                      />
                    ) : (
                      <QuickActions
                        editorInstance={editorInstance}
                        resetAutocompleteSecrets={() => {
                          if (secretAutocomplete && monaco) {
                            secretAutocomplete.dispose();
                            registerSecretsAutocomplete(monaco, setSecretAutocomplete);
                          }
                        }}
                      />
                    ))}
                </div>

                {isKafkaConnectPipeline(p.yaml) && (
                  <Alert variant="destructive">
                    <AlertCircle size={16} />
                    <AlertDescription>
                      <UIText>
                        This looks like a Kafka Connect configuration. For help with Redpanda Connect configurations,{' '}
                        <UILink
                          href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/"
                          target="_blank"
                        >
                          see our quickstart documentation
                        </UILink>
                        .
                      </UIText>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ),
          },
          {
            key: 'preview',
            title: 'Pipeline preview',
            content: <></>,
            disabled: true,
          },
        ]}
      />
    );
  }
);

/**
 * Determines whether a given string represents a Kafka Connect configuration.
 *
 * This function first attempts to parse the input as JSON. If the parsing is successful,
 * it checks for the presence of specific Kafka Connect-related keys commonly found in
 * configurations, such as "connector.class", "key.converter", and "value.converter".
 *
 * @param {string | undefined} value - The input string to evaluate as a potential Kafka Connect configuration.
 * @returns {boolean} - Returns `true` if the string is a valid JSON object containing
 *                      at least a subset of Kafka Connect configuration keys; otherwise, returns `false`.
 *
 * @example
 * ```typescript
 * const configString = `{
 *     "connector.class": "com.ibm.eventstreams.connect.mqsink.MQSinkConnector",
 *     "key.converter": "org.apache.kafka.connect.converters.ByteArrayConverter",
 *     "value.converter": "org.apache.kafka.connect.converters.ByteArrayConverter"
 * }`;
 *
 * const result = isKafkaConnectPipeline(configString);
 * console.log(result); // Output: true
 * ```
 */
const isKafkaConnectPipeline = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }
  // Attempt to parse the input string as JSON
  let json: object;
  try {
    json = JSON.parse(value);
  } catch (_e) {
    // If parsing fails, it's not a valid JSON and hence not a Kafka Connect config
    return false;
  }

  const kafkaConfigKeys = [
    'connector.class',
    'key.converter',
    'value.converter',
    'header.converter',
    'tasks.max.enforce',
    'errors.log.enable',
  ];

  const matchCount = kafkaConfigKeys.filter((key) => Object.keys(json).includes(key)).length;

  return matchCount > 0;
};
