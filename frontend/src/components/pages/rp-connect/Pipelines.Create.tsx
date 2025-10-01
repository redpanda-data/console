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
import { Button, Flex, FormField, Input, NumberInput, useDisclosure } from '@redpanda-data/ui';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button as NewButton } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Link as UILink, Text as UIText } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { isFeatureFlagEnabled } from 'config';
import { useSessionStorage } from 'hooks/use-session-storage';
import { AlertCircle, PlusIcon } from 'lucide-react';
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import type { editor, IDisposable, languages } from 'monaco-editor';
import { PipelineCreateSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import React, { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CONNECT_WIZARD_CONNECTOR_KEY,
  CONNECT_WIZARD_TOPIC_KEY,
  CONNECT_WIZARD_USER_KEY,
} from 'state/connect/state';
import { appGlobal } from '../../../state/appGlobal';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';
import { LintResults } from '../remote-mcp/create/components/lint-results';
import { extractLintHintsFromError } from './errors';
import { AddConnectorDialog } from './onboarding/add-connector-dialog';
import { SecretsQuickAdd } from './secrets/Secrets.QuickAdd';
import { MAX_TASKS, MIN_TASKS, tasksToCPU } from './tasks';
import type { ConnectComponentType } from './types/rpcn-schema';
import type { ConnectTilesFormData } from './types/wizard';
import { getComponentTypeBadgeProps } from './utils/badges';
import { getConnectTemplate } from './utils/yaml';

const exampleContent = `
`;

@observer
class RpConnectPipelinesCreate extends PageComponent<{}> {
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

  render() {
    if (!pipelinesApi.pipelines) return DefaultSkeleton;
    if (rpcnSecretManagerApi.secrets) {
      // inject secrets to editor
      this.secrets.updateWith(rpcnSecretManagerApi.secrets.map((value) => value.id));
    }
    const alreadyExists = pipelinesApi.pipelines.any((x) => x.id === this.fileName);
    const isNameEmpty = this.fileName.trim().length === 0;

    const CreateButton = () => {
      return (
        <Button
          variant="solid"
          isDisabled={alreadyExists || isNameEmpty || this.isCreating}
          loadingText="Creating..."
          isLoading={this.isCreating}
          onClick={action(() => this.createPipeline())}
        >
          Create
        </Button>
      );
    };

    return (
      <PageContent>
        <div className="my-2">
          <UIText>
            For help creating your pipeline, see our{' '}
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
          <FormField label="Pipeline name" isInvalid={alreadyExists} errorText="Pipeline name is already in use">
            <Flex alignItems="center" gap="2">
              <Input
                placeholder="Enter a config name..."
                data-testid="pipelineName"
                pattern="[a-zA-Z0-9_\-]+"
                isRequired
                value={this.fileName}
                onChange={(x) => (this.fileName = x.target.value)}
                width={500}
              />
            </Flex>
          </FormField>
          <FormField label="Description">
            <Input
              data-testid="pipelineDescription"
              value={this.description}
              onChange={(x) => (this.description = x.target.value)}
              width={500}
            />
          </FormField>
          <FormField
            label="Compute Units"
            description="One compute unit is equivalent to 0.1 CPU and 400 MB of memory. This is enough to experiment with low-volume pipelines."
            w={500}
          >
            <NumberInput
              value={this.tasks}
              onChange={(e) => (this.tasks = Number(e ?? MIN_TASKS))}
              min={MIN_TASKS}
              max={MAX_TASKS}
              maxWidth={150}
            />
          </FormField>
        </Flex>

        <div className="mt-4">
          <PipelineEditor yaml={this.editorContent} onChange={(x) => (this.editorContent = x)} secrets={this.secrets} />
        </div>

        {/* Lint Results - displayed after Create button is clicked */}
        {this.lintResults && Object.keys(this.lintResults).length > 0 && (
          <div className="mt-4">
            <LintResults lintResults={this.lintResults} />
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

  async createPipeline() {
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
        }),
      )
      .then(
        action(async () => {
          // Clear lint results on successful creation
          this.lintResults = {};

          // Clear wizard session storage
          sessionStorage.removeItem(CONNECT_WIZARD_CONNECTOR_KEY);
          sessionStorage.removeItem(CONNECT_WIZARD_TOPIC_KEY);
          sessionStorage.removeItem(CONNECT_WIZARD_USER_KEY);

          await pipelinesApi.refreshPipelines(true);
          appGlobal.historyPush('/connect-clusters');
        }),
      )
      .catch(
        action((err) => {
          // Extract all errors as lint hints and display them inline
          this.lintResults = extractLintHintsFromError(err);
        }),
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
  onAddConnector: ((connectionName: string, connectionType: ConnectComponentType) => void) | undefined;
}

const processorTypes: ConnectComponentType[] = [
  'buffer',
  'cache',
  'processor',
  'rate_limit',
  'metrics',
  'tracer',
  'scanner',
];

const AddConnectorButton = ({
  type,
  onClick,
}: {
  type: ConnectComponentType;
  onClick: (type: ConnectComponentType) => void;
}) => {
  const { text, variant, className, icon } = getComponentTypeBadgeProps(type);
  return (
    <Badge icon={icon} variant={variant} className="cursor-pointer max-w-fit" onClick={() => onClick(type)}>
      {text}
      <PlusIcon size={12} className={cn(className, 'ml-3 mb-0.5')} />
    </Badge>
  );
};

const QuickActions = ({ editorInstance, resetAutocompleteSecrets, onAddConnector }: QuickActionsProps) => {
  const { isOpen: isAddSecretOpen, onOpen: openAddSecret, onClose: closeAddSecret } = useDisclosure();
  const enableRpcnTiles = isFeatureFlagEnabled('enableRpcnTiles');
  const { isOpen: isAddConnectorOpen, onOpen: openAddConnector, onClose: closeAddConnector } = useDisclosure();
  const [selectedConnector, setSelectedConnector] = useState<ConnectComponentType | undefined>(undefined);
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

  const handleConnectorTypeChange = (connectorType: ConnectComponentType) => {
    setSelectedConnector(connectorType);
    openAddConnector();
  };

  const handleAddConnector = (connectionName: string, connectionType: ConnectComponentType) => {
    onAddConnector?.(connectionName, connectionType);
    closeAddConnector();
  };

  const hasInput = editorInstance.getValue().includes('input:');
  const hasOutput = editorInstance.getValue().includes('output:');

  return (
    <div className="flex gap-3 flex-col">
      <Card>
        <CardHeader>
          <CardTitle>Variables</CardTitle>
          <CardDescription>Add a reference to a new or existing secret value, such as a key.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewButton variant="secondary" onClick={openAddSecret}>
            <PlusIcon className="size-4" color="white" />
            Add Secrets
          </NewButton>
        </CardContent>
      </Card>
      <SecretsQuickAdd isOpen={isAddSecretOpen} onCloseAddSecret={closeAddSecret} onAdd={onAddSecret} />
      {enableRpcnTiles && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Connectors</CardTitle>
              <CardDescription>Add connectors to your pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="gap-4 flex flex-col space-y-0">
              <div className="flex-wrap flex gap-2">
                {processorTypes.map((processorType) => (
                  <AddConnectorButton
                    key={processorType}
                    type={processorType}
                    onClick={() => handleConnectorTypeChange(processorType)}
                  />
                ))}
              </div>
              {(!hasInput || !hasOutput) && (
                <div className="flex flex-col gap-2">
                  <Separator className="mb-2" />
                  {!hasInput && <AddConnectorButton type="input" onClick={() => handleConnectorTypeChange('input')} />}
                  {!hasOutput && (
                    <AddConnectorButton type="output" onClick={() => handleConnectorTypeChange('output')} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <AddConnectorDialog
            isOpen={isAddConnectorOpen}
            onCloseAddConnector={closeAddConnector}
            onAddConnector={handleAddConnector}
            connectorType={selectedConnector}
          />
        </>
      )}
    </div>
  );
};

const registerSecretsAutocomplete = async (
  monaco: Monaco,
  setSecretAutocomplete: Dispatch<SetStateAction<IDisposable | undefined>>,
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

    const persistedConnectComponentTemplate = useMemo(() => {
      if (!persistedFormData?.connectionName || !persistedFormData?.connectionType) {
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

    const resetEditor = async () => {
      if (monaco) {
        await registerSecretsAutocomplete(monaco, setSecretAutocomplete);
      }
    };

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

    return (
      <Tabs
        tabs={[
          {
            key: 'config',
            title: 'Configuration',
            content: () => (
              <div>
                {/* yaml editor */}
                <Flex height="400px" gap={7}>
                  <PipelinesYamlEditor
                    defaultPath="config.yaml"
                    path="config.yaml"
                    value={yaml}
                    onChange={(e) => {
                      if (e) p.onChange?.(e);
                    }}
                    language="yaml"
                    options={{
                      readOnly: p.isDisabled,
                    }}
                    onMount={async (editor, monaco) => {
                      setMonaco(monaco);
                      setEditorInstance(editor);
                      await registerSecretsAutocomplete(monaco, setSecretAutocomplete);
                    }}
                  />

                  {!p.isDisabled && (
                    <QuickActions
                      editorInstance={editorInstance}
                      resetAutocompleteSecrets={resetEditor}
                      onAddConnector={handleAddConnector}
                    />
                  )}
                </Flex>

                {isKafkaConnectPipeline(p.yaml) && (
                  <Alert variant="destructive">
                    <AlertCircle size={16} />
                    <AlertDescription>
                      <UIText>
                        This looks like a Kafka Connect configuration. For help with Redpanda Connect configurations,{' '}
                        <UILink
                          target="_blank"
                          href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/"
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
  },
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
