'use client';

import { create } from '@bufbuild/protobuf';
import { formatPipelineError } from 'components/pages/rp-connect/errors';
import { Button } from 'components/redpanda-ui/components/button';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft, ArrowRight, FileText, Wrench } from 'lucide-react';
import { runInAction } from 'mobx';
import { Pipeline_ResourcesSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  CreateMCPServerRequestSchema,
  LintMCPConfigRequestSchema,
  type MCPServer_Tool,
  MCPServer_Tool_ComponentType,
  MCPServer_ToolSchema,
  MCPServerCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useEffect, useState } from 'react';
import { useCreateMCPServerMutation, useLintMCPConfigMutation } from 'react-query/api/remote-mcp';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/uiState';
import { RemoteMCPBackButton } from '../remote-mcp-back-button';
import { RemoteMCPCreateMetadataStep } from './metadata/remote-mcp-create-metadata-step';
import { RemoteMCPCreateToolsStep } from './tools/remote-mcp-create-tools-step';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Create Remote MCP Server';
    uiState.pageBreadcrumbs = [
      { title: 'Remote MCP', linkTo: '/remote-mcp' },
      { title: 'Create Remote MCP Server', linkTo: '' },
    ];
  });
};

export interface Tool {
  id: string;
  name: string;
  componentType?: MCPServer_Tool_ComponentType;
  configYaml: string;
  validationError?: string;
  selectedTemplate?: string;
}

const { Stepper } = defineStepper(
  {
    id: 'metadata',
    title: 'Metadata',
    description: 'Configure server information',
    icon: <FileText />,
  },
  {
    id: 'tools',
    title: 'Tools',
    description: 'Define with YAML config',
    icon: <Wrench />,
  },
);

export const RemoteMCPCreatePage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createMCPServer, isPending } = useCreateMCPServerMutation();
  const { mutateAsync: lintMCPConfig } = useLintMCPConfigMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<Array<{ key: string; value: string }>>([]);
  const [resources, setResources] = useState('XSmall');
  const [tools, setTools] = useState<Tool[]>([
    {
      id: '1',
      name: '',
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      configYaml: '',
      validationError: undefined,
    },
  ]);
  const [expandedEditor, setExpandedEditor] = useState<string | null>(null);

  useEffect(() => {
    updatePageTitle();
  }, []);

  const validateMetadata = () => {
    return displayName.trim() !== '';
  };

  const validateTools = () => {
    return tools.every((tool) => tool.validationError === undefined);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Convert form data to the expected protobuf format
      const toolsMap: { [key: string]: MCPServer_Tool } = {};

      for (const tool of tools) {
        toolsMap[tool.name] = create(MCPServer_ToolSchema, {
          componentType: tool.componentType,
          configYaml: tool.configYaml,
        });
      }

      // Run lint validation first
      try {
        const lintRequest = create(LintMCPConfigRequestSchema, {
          tools: toolsMap,
        });

        const lintResponse = await lintMCPConfig(lintRequest);

        // Check if there are any lint errors
        const hasErrors = Object.keys(lintResponse.lintHints).length > 0;
        if (hasErrors) {
          // Show toast error with the first lint error found
          const firstToolWithError = Object.keys(lintResponse.lintHints)[0];
          const firstError = lintResponse.lintHints[firstToolWithError];
          toast.error(`Configuration error in tool "${firstToolWithError}": ${firstError.hint}`);
          setIsSubmitting(false);
          return;
        }
      } catch (lintError) {
        // Show formatted error for lint API failure
        const formattedError = formatPipelineError(lintError);
        toast.error(formattedError);
        setIsSubmitting(false);
        return;
      }

      const tagsMap: { [key: string]: string } = {};
      for (const tag of tags) {
        tagsMap[tag.key] = tag.value;
      }

      // Map resource sizes to actual values
      const resourceValues = {
        small: { cpu: '0.5', memory: '1Gi' },
        medium: { cpu: '1', memory: '2Gi' },
        large: { cpu: '2', memory: '4Gi' },
      }[resources] || { cpu: '0.5', memory: '1Gi' };

      const request = create(CreateMCPServerRequestSchema, {
        mcpServer: create(MCPServerCreateSchema, {
          displayName,
          description,
          tools: toolsMap,
          tags: tagsMap,
          resources: create(Pipeline_ResourcesSchema, {
            cpuShares: resourceValues.cpu,
            memoryShares: resourceValues.memory,
          }),
        }),
      });

      const response = await createMCPServer(request);

      // Navigate to the created server details page if it is already available to view.
      if (response.mcpServer?.id) {
        navigate(`/remote-mcp/${response.mcpServer.id}`);
      } else {
        // Worst case, just go to the details page.
        navigate('/remote-mcp');
      }
    } catch (error) {
      console.error('Failed to create MCP server:', error);
      // Error handling is already done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <RemoteMCPBackButton />
        </div>
        <Heading level={1} className="text-gray-900 mb-2">
          Create MCP Server
        </Heading>
        <Text className="text-gray-600">Set up a new managed MCP server with custom tools and configurations.</Text>
      </div>

      <Stepper.Provider className="space-y-8" variant="horizontal">
        {({ methods }) => (
          <>
            <Stepper.Navigation>
              {methods.all.map((step) => (
                <Stepper.Step key={step.id} of={step.id} onClick={() => methods.goTo(step.id)} icon={step.icon}>
                  <Stepper.Title>{step.title}</Stepper.Title>
                  <Stepper.Description>{step.description}</Stepper.Description>
                </Stepper.Step>
              ))}
            </Stepper.Navigation>

            {methods.switch({
              metadata: () => (
                <Stepper.Panel>
                  <RemoteMCPCreateMetadataStep
                    displayName={displayName}
                    setDisplayName={setDisplayName}
                    description={description}
                    setDescription={setDescription}
                    tags={tags}
                    setTags={setTags}
                    resources={resources}
                    setResources={setResources}
                  />
                </Stepper.Panel>
              ),
              tools: () => (
                <Stepper.Panel>
                  <RemoteMCPCreateToolsStep
                    tools={tools}
                    setTools={setTools}
                    expandedEditor={expandedEditor}
                    setExpandedEditor={setExpandedEditor}
                  />
                </Stepper.Panel>
              ),
            })}

            <div className="flex justify-between mt-8">
              <div>
                {!methods.isFirst && (
                  <Button variant="outline" onClick={methods.prev} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Previous
                  </Button>
                )}
              </div>
              <div>
                {!methods.isLast ? (
                  <Button
                    onClick={methods.next}
                    disabled={methods.current.id === 'metadata' ? !validateMetadata() : false}
                    className="gap-2"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!validateTools() || isSubmitting || isPending}
                    className="gap-2"
                  >
                    {isSubmitting || isPending ? 'Creating...' : 'Create MCP Server'}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </Stepper.Provider>
    </div>
  );
};
