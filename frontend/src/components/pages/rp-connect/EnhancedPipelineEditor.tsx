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

import type { Monaco } from '@monaco-editor/react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Flex,
  Link as ChLink,
  Text,
  Tooltip,
  useColorModeValue,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { editor, IDisposable } from 'monaco-editor';
import React, { useEffect, useRef, useState } from 'react';
import { rpcnSecretManagerApi } from '../../../state/backendApi';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import Tabs from '../../misc/tabs/Tabs';

interface EnhancedPipelineEditorProps {
  yaml: string;
  onChange?: (newYaml: string) => void;
  secrets?: string[];
  quickActions?: React.FunctionComponent;
  isDisabled?: boolean;
  externalYaml?: string;
  externalYamlRevision?: number;
  onAcceptExternalChanges?: () => void;
  onRejectExternalChanges?: () => void;
  showExternalChanges?: boolean;
}

interface AiModifiedRange {
  startLineNumber: number;
  endLineNumber: number;
  timestamp: number;
}

const registerSecretsAutocomplete = async (
  monaco: Monaco,
  setSecretAutocomplete: React.Dispatch<React.SetStateAction<IDisposable | undefined>>
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
      const completeItems = secrets.map((secret) => ({
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

export const EnhancedPipelineEditor = observer((props: EnhancedPipelineEditorProps) => {
  const {
    yaml,
    onChange,
    secrets,
    quickActions,
    isDisabled,
    externalYaml,
    externalYamlRevision,
    onAcceptExternalChanges,
    onRejectExternalChanges,
    showExternalChanges,
  } = props;

  const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);
  const [secretAutocomplete, setSecretAutocomplete] = useState<IDisposable | undefined>(undefined);
  const [monaco, setMonaco] = useState<Monaco | undefined>(undefined);
  const [aiModifiedRanges, setAiModifiedRanges] = useState<AiModifiedRange[]>([]);
  const [isExternalUpdate, setIsExternalUpdate] = useState(false);
  
  const lastExternalRevision = useRef<number>(0);
  const highlightBgColor = useColorModeValue('yellow.100', 'yellow.900');
  const conflictBgColor = useColorModeValue('red.100', 'red.900');

  const resetEditor = async () => {
    if (monaco) {
      await registerSecretsAutocomplete(monaco, setSecretAutocomplete);
    }
  };

  // Handle external YAML updates from AI
  useEffect(() => {
    if (
      externalYaml &&
      externalYamlRevision &&
      externalYamlRevision > lastExternalRevision.current &&
      editorInstance &&
      !isExternalUpdate
    ) {
      const currentValue = editorInstance.getValue();
      
      // Check if there are user modifications
      if (currentValue !== yaml && currentValue.trim() !== '') {
        // There's a conflict - user has made changes
        setIsExternalUpdate(true);
      } else {
        // No user changes, safely apply AI updates
        setIsExternalUpdate(true);
        editorInstance.setValue(externalYaml);
        onChange?.(externalYaml);
        
        // Highlight the AI-modified sections
        const model = editorInstance.getModel();
        if (model) {
          const lineCount = model.getLineCount();
          const newRange: AiModifiedRange = {
            startLineNumber: 1,
            endLineNumber: lineCount,
            timestamp: Date.now(),
          };
          setAiModifiedRanges([newRange]);
          
          // Add decorations to show AI-modified areas
          const decorations = editorInstance.deltaDecorations(
            [],
            [
              {
                range: {
                  startLineNumber: newRange.startLineNumber,
                  startColumn: 1,
                  endLineNumber: newRange.endLineNumber,
                  endColumn: 1,
                },
                options: {
                  className: 'ai-modified-line',
                  marginClassName: 'ai-modified-margin',
                  hoverMessage: { value: 'Modified by AI Assistant' },
                },
              },
            ]
          );
          
          // Clear decorations after 5 seconds
          setTimeout(() => {
            if (editorInstance) {
              editorInstance.deltaDecorations(decorations, []);
            }
          }, 5000);
        }
        
        setIsExternalUpdate(false);
      }
      
      lastExternalRevision.current = externalYamlRevision;
    }
  }, [externalYaml, externalYamlRevision, editorInstance, yaml, onChange, isExternalUpdate]);

  // Clear AI modified ranges after some time
  useEffect(() => {
    const timer = setTimeout(() => {
      setAiModifiedRanges((ranges) => 
        ranges.filter((range) => Date.now() - range.timestamp < 10000)
      );
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [aiModifiedRanges]);

  useEffect(() => {
    return () => {
      if (secretAutocomplete) {
        secretAutocomplete.dispose();
      }
    };
  }, [secretAutocomplete]);

  const handleAcceptExternalChanges = () => {
    if (externalYaml && editorInstance) {
      editorInstance.setValue(externalYaml);
      onChange?.(externalYaml);
      onAcceptExternalChanges?.();
      setIsExternalUpdate(false);
    }
  };

  const handleRejectExternalChanges = () => {
    onRejectExternalChanges?.();
    setIsExternalUpdate(false);
  };

  const QuickActionsComponent = quickActions;

  return (
    <Box>
      {/* External Changes Notification */}
      {showExternalChanges && (
        <Alert status="info" mb={4}>
          <AlertIcon />
          <Box flex="1">
            <Text fontWeight="medium">AI Assistant has updated the pipeline</Text>
            <Text fontSize="sm" mt={1}>
              The AI has made changes to your pipeline configuration. You can accept these changes or keep your current version.
            </Text>
          </Box>
          <Flex gap={2} ml={4}>
            <Badge
              colorScheme="blue"
              cursor="pointer"
              onClick={handleAcceptExternalChanges}
              _hover={{ bg: 'blue.600', color: 'white' }}
            >
              Accept AI Changes
            </Badge>
            <Badge
              colorScheme="gray"
              cursor="pointer"
              onClick={handleRejectExternalChanges}
              _hover={{ bg: 'gray.600', color: 'white' }}
            >
              Keep My Version
            </Badge>
          </Flex>
        </Alert>
      )}

      {/* AI Status Indicator */}
      {aiModifiedRanges.length > 0 && (
        <Box mb={2}>
          <Tooltip label="AI recently modified this content">
            <Badge colorScheme="purple" size="sm">
              <Flex align="center" gap={1}>
                <Box w="6px" h="6px" bg="purple.400" borderRadius="full" />
                <Text fontSize="xs">AI Modified</Text>
              </Flex>
            </Badge>
          </Tooltip>
        </Box>
      )}

      <Tabs
        tabs={[
          {
            key: 'config',
            title: 'Configuration',
            content: () => (
              <Box>
                <Flex height="400px" gap={7}>
                  <PipelinesYamlEditor
                    defaultPath="config.yaml"
                    path="config.yaml"
                    value={yaml}
                    onChange={(value) => {
                      if (value && !isExternalUpdate) {
                        onChange?.(value);
                      }
                    }}
                    language="yaml"
                    options={{
                      readOnly: isDisabled,
                      glyphMargin: true,
                      lineDecorationsWidth: 10,
                    }}
                    onMount={async (editor, monacoInstance) => {
                      setMonaco(monacoInstance);
                      setEditorInstance(editor);
                      await registerSecretsAutocomplete(monacoInstance, setSecretAutocomplete);

                      // Add CSS styles for AI modifications
                      const style = document.createElement('style');
                      style.textContent = `
                        .ai-modified-line {
                          background: ${highlightBgColor} !important;
                          border-left: 3px solid #9333ea !important;
                        }
                        .ai-modified-margin {
                          background: #9333ea !important;
                          width: 3px !important;
                        }
                        .conflict-line {
                          background: ${conflictBgColor} !important;
                          border-left: 3px solid #dc2626 !important;
                        }
                      `;
                      document.head.appendChild(style);
                    }}
                  />
                  {!isDisabled && QuickActionsComponent && (
                    <QuickActionsComponent editorInstance={editorInstance} resetAutocompleteSecrets={resetEditor} />
                  )}
                </Flex>
                
                {isKafkaConnectPipeline(yaml) && (
                  <Alert status="error" my={2}>
                    <AlertIcon />
                    <Text>
                      This looks like a Kafka Connect configuration. For help with Redpanda Connect configurations,{' '}
                      <ChLink
                        target="_blank"
                        href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/"
                      >
                        see our quickstart documentation
                      </ChLink>
                      .
                    </Text>
                  </Alert>
                )}
              </Box>
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
    </Box>
  );
});

export default EnhancedPipelineEditor;