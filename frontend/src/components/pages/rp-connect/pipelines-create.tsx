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
import { ConnectError } from '@connectrpc/connect';
import type { Monaco } from '@monaco-editor/react';
import { Flex, FormField, Input, NumberInput, useDisclosure } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Link as UILink } from 'components/redpanda-ui/components/typography';
import { isEmbedded, isFeatureFlagEnabled } from 'config';
import { AlertCircle, ArrowRight, PlusIcon, Sparkles } from 'lucide-react';
import type { editor, IDisposable, IPosition, languages } from 'monaco-editor';
import { AnimatePresence, motion } from 'motion/react';
import { PipelineCreateSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import React, { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { docsLinks } from 'utils/docs-links';

import { formatPipelineError } from './errors';
import PipelinePage from './pipeline';
import { SecretsQuickAdd } from './secrets/secrets-quick-add';
import { cpuToTasks, MAX_TASKS, MIN_TASKS, tasksToCPU } from './tasks';
import { TemplateGalleryDialog } from './template-gallery/template-gallery-dialog';
import { getContextualVariableSyntax, REDPANDA_CONTEXTUAL_VARIABLES } from './types/constants';
import { appGlobal } from '../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backend-api';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import PipelinesYamlEditor from '../../misc/pipelines-yaml-editor';
import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';

const exampleContent = `
`;

// biome-ignore lint/complexity/noBannedTypes: empty object represents pages with no route params
class RpConnectPipelinesCreate extends PageComponent<{}> {
  initPage(p: PageInitHelper): void {
    p.title = 'Create Pipeline';
    p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
    p.addBreadcrumb('Create Pipeline', '');

    this.refreshData(true);
    rpcnSecretManagerApi.refreshSecrets(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(_force: boolean) {
    pipelinesApi.refreshPipelines(_force);
  }

  render() {
    if (isFeatureFlagEnabled('enableRpcnTiles') && isEmbedded()) {
      return <PipelinePage />;
    }
    if (!pipelinesApi.pipelines) {
      return DefaultSkeleton;
    }
    return <RpConnectPipelinesCreateContent />;
  }
}

export default RpConnectPipelinesCreate;

const RpConnectPipelinesCreateContent = () => {
  const [fileName, setFileName] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState(MIN_TASKS);
  const [editorContent, setEditorContent] = useState(exampleContent);
  const [isCreating, setIsCreating] = useState(false);
  const isTemplateGalleryEnabled = isFeatureFlagEnabled('enableRpcnTemplateGallery');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const isEditorPristine = editorContent.trim() === '';

  const secrets = rpcnSecretManagerApi.secrets?.map((s) => s.id) ?? [];
  const alreadyExists = (pipelinesApi.pipelines ?? []).some((x) => x.id === fileName);
  const isNameEmpty = fileName.trim().length === 0;

  const createPipeline = () => {
    setIsCreating(true);

    pipelinesApi
      .createPipeline(
        create(PipelineCreateSchema, {
          configYaml: editorContent,
          description,
          displayName: fileName,
          resources: {
            cpuShares: tasksToCPU(tasks) || '0',
            memoryShares: '0', // still required by API but unused
          },
          tags: {
            __redpanda_cloud_pipeline_type: 'pipeline',
          },
        })
      )
      .then(async (r) => {
        toast.success('Pipeline created');
        const retUnits = cpuToTasks(r.response?.pipeline?.resources?.cpuShares);
        if (retUnits && tasks !== retUnits) {
          toast.warning(`Pipeline has been resized to use ${retUnits} compute units`);
        }
        await pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush('/connect-clusters');
      })
      .catch((err) => {
        toast.error('Failed to create pipeline', {
          description: formatPipelineError(ConnectError.from(err)),
        });
      })
      .finally(() => {
        setIsCreating(false);
      });
  };

  return (
    <PageContent>
      <div className="my-2">
        <div className="text-body">
          For help creating your pipeline, see our{' '}
          <UILink href={docsLinks.cloud.connectQuickstart} rel="noopener noreferrer" target="_blank">
            quickstart
          </UILink>
          ,{' '}
          <UILink href={docsLinks.cloud.connectCookbooks} rel="noopener noreferrer" target="_blank">
            library of examples
          </UILink>
          , and{' '}
          <UILink href={docsLinks.cloud.connectComponentCatalog} rel="noopener noreferrer" target="_blank">
            connector catalog
          </UILink>
          .
        </div>
      </div>

      <Flex flexDirection="column" gap={3}>
        <FormField errorText="Pipeline name is already in use" isInvalid={alreadyExists} label="Pipeline name">
          <Flex alignItems="center" gap="2">
            <Input
              data-testid="pipelineName"
              isRequired
              onChange={(x) => {
                setFileName(x.target.value);
              }}
              pattern="[a-zA-Z0-9_\-]+"
              placeholder="Enter a config name..."
              value={fileName}
              width={500}
            />
          </Flex>
        </FormField>
        <FormField label="Description">
          <Input
            data-testid="pipelineDescription"
            onChange={(x) => {
              setDescription(x.target.value);
            }}
            value={description}
            width={500}
          />
        </FormField>
        <FormField
          description="One compute unit is equivalent to 0.1 CPU and 400 MB of memory. This is enough to experiment with low-volume pipelines."
          label="Compute units"
          w={500}
        >
          <NumberInput
            max={MAX_TASKS}
            maxWidth={150}
            min={MIN_TASKS}
            onChange={(e) => {
              setTasks(Number(e ?? MIN_TASKS));
            }}
            value={tasks}
          />
        </FormField>
      </Flex>

      <AnimatePresence>
        {isTemplateGalleryEnabled && isEditorPristine ? (
          <motion.button
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="group mt-4 flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-primary/30 border-dashed bg-primary/5 px-5 py-4 text-left transition-all hover:border-primary/60 hover:bg-primary/10 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            data-testid="template-gallery-cta"
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } }}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            onClick={() => setIsTemplateDialogOpen(true)}
            transition={{ duration: 0.3, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            type="button"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-1 flex-col">
              <span className="font-semibold text-foreground">Start from a template</span>
              <span className="text-muted-foreground text-sm">
                Pre-paired source-and-sink patterns. Fill in a short form, or bail out anytime to keep editing YAML
                directly.
              </span>
            </div>
            <ArrowRight
              aria-hidden
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <div className="mt-4">
        <PipelineEditor
          onChange={(x) => {
            setEditorContent(x);
          }}
          secrets={secrets}
          yaml={editorContent}
        />
      </div>

      <Flex alignItems="center" gap="4">
        <Button disabled={alreadyExists || isNameEmpty || isCreating} onClick={createPipeline} variant="primary">
          {Boolean(isCreating) && <Spinner />}
          {isCreating ? 'Creating...' : 'Create'}
        </Button>
        <Link search={{} as never} to="/connect-clusters">
          <Button variant="link">Cancel</Button>
        </Link>
      </Flex>

      {isTemplateGalleryEnabled ? (
        <TemplateGalleryDialog
          onClose={(stashedYaml) => {
            if (stashedYaml) {
              setEditorContent(stashedYaml);
            }
            setIsTemplateDialogOpen(false);
          }}
          onSubmit={({ pipelineName, yaml }) => {
            setEditorContent(yaml);
            if (!fileName) {
              setFileName(pipelineName);
            }
            setIsTemplateDialogOpen(false);
            toast.success('Template applied — review the YAML and click Create to deploy.');
          }}
          open={isTemplateDialogOpen}
        />
      ) : null}
    </PageContent>
  );
};

type QuickActionsProps = {
  editorInstance: editor.IStandaloneCodeEditor | null;
  resetAutocompleteSecrets: VoidFunction;
};

const QuickActions = ({ editorInstance, resetAutocompleteSecrets }: QuickActionsProps) => {
  const { isOpen: isAddSecretOpen, onOpen: openAddSecret, onClose: closeAddSecret } = useDisclosure();

  if (editorInstance === null) {
    return <div className="min-w-[300px]" />;
  }

  const onAddSecret = (secretNotation: string) => {
    const selection = editorInstance.getSelection();
    if (selection === null) {
      return;
    }
    const id = { major: 1, minor: 1 };
    const op = { identifier: id, range: selection, text: secretNotation, forceMoveMarkers: true };
    editorInstance.executeEdits('my-source', [op]);
    resetAutocompleteSecrets();
    closeAddSecret();
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Variables</CardTitle>
          <CardDescription>Add a reference to a new or existing secret value, such as a key.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={openAddSecret} variant="outline">
            <PlusIcon className="size-4" color="white" />
            Add secrets
          </Button>
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
    provideCompletionItems: (model: editor.ITextModel, position: IPosition) => {
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
        range,
      }));
      return {
        suggestions: completeItems,
      };
    },
  });
  setSecretAutocomplete(autocomplete);
};

const registerContextualVariablesAutocomplete = (
  monaco: Monaco,
  setContextualVarsAutocomplete: Dispatch<SetStateAction<IDisposable | undefined>>
) => {
  const contextualVars = Object.values(REDPANDA_CONTEXTUAL_VARIABLES);

  const autocomplete = monaco.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: ['$', '{'],
    provideCompletionItems: (model: editor.ITextModel, position: IPosition) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = contextualVars.map<languages.CompletionItem>((cv) => ({
        label: getContextualVariableSyntax(cv.name),
        kind: monaco.languages.CompletionItemKind.Variable,
        detail: cv.description,
        documentation: `Contextual variable: ${cv.description}`,
        insertText: getContextualVariableSyntax(cv.name),
        range,
      }));

      return { suggestions };
    },
  });

  setContextualVarsAutocomplete(autocomplete);
};

export const PipelineEditor = (p: {
  yaml: string;
  onChange?: (newYaml: string) => void;
  secrets?: string[];
  quickActions?: React.FunctionComponent;
  isDisabled?: boolean;
}) => {
  const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);
  const [secretAutocomplete, setSecretAutocomplete] = useState<IDisposable | undefined>(undefined);
  const [contextualVarsAutocomplete, setContextualVarsAutocomplete] = useState<IDisposable | undefined>(undefined);
  const [monaco, setMonaco] = useState<Monaco | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (secretAutocomplete) {
        // avoid duplicate secret autocomplete registration
        secretAutocomplete.dispose();
      }
      if (contextualVarsAutocomplete) {
        // avoid duplicate contextual variables autocomplete registration
        contextualVarsAutocomplete.dispose();
      }
    };
  }, [secretAutocomplete, contextualVarsAutocomplete]);

  // Monaco reads `defaultValue` only at mount, so external updates (applying a
  // template, restoring stashed YAML) must be pushed in imperatively. The guard
  // skips normal typing, where `p.yaml` already equals the editor's content.
  useEffect(() => {
    if (editorInstance && editorInstance.getValue() !== p.yaml) {
      editorInstance.setValue(p.yaml);
    }
  }, [editorInstance, p.yaml]);

  return (
    <Tabs
      tabs={[
        {
          key: 'config',
          title: 'Configuration',
          content: () => (
            <div>
              <div className="flex min-h-[400px] gap-7">
                <PipelinesYamlEditor
                  defaultPath="config.yaml"
                  defaultValue={p.yaml}
                  language="yaml"
                  onChange={(e) => {
                    // Propagate empty content too — clearing the editor must
                    // flip `isEditorPristine` so the template CTA can re-appear.
                    p.onChange?.(e ?? '');
                  }}
                  onMount={async (editorRef, monacoInst) => {
                    setEditorInstance(editorRef);
                    setMonaco(monacoInst);
                    await registerSecretsAutocomplete(monacoInst, setSecretAutocomplete);
                    registerContextualVariablesAutocomplete(monacoInst, setContextualVarsAutocomplete);
                  }}
                  options={{
                    readOnly: p.isDisabled,
                  }}
                  path="config.yaml"
                />

                {!p.isDisabled && (
                  <QuickActions
                    editorInstance={editorInstance}
                    resetAutocompleteSecrets={async () => {
                      if (secretAutocomplete && monaco) {
                        secretAutocomplete.dispose();
                        await registerSecretsAutocomplete(monaco, setSecretAutocomplete);
                      }
                    }}
                  />
                )}
              </div>

              {isKafkaConnectPipeline(p.yaml) && (
                <Alert variant="destructive">
                  <AlertCircle size={16} />
                  <AlertDescription>
                    <div className="text-body">
                      This looks like a Kafka Connect configuration. For help with Redpanda Connect configurations,{' '}
                      <UILink href={docsLinks.cloud.connectQuickstart} rel="noopener noreferrer" target="_blank">
                        see our quickstart documentation
                      </UILink>
                      .
                    </div>
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
};

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
  let json: object;
  try {
    json = JSON.parse(value);
  } catch (_e) {
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
