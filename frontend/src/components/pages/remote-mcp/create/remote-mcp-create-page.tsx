'use client';

import { create } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft, ArrowRight, FileText, Wrench } from 'lucide-react';
import { runInAction } from 'mobx';
import { Pipeline_ResourcesSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  CreateMCPServerRequestSchema,
  type MCPServer_Tool,
  MCPServer_Tool_ComponentType,
  MCPServer_ToolSchema,
  MCPServerCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useEffect, useState } from 'react';
import { useCreateMCPServerMutation } from 'react-query/api/remote-mcp';
import { Link, useNavigate } from 'react-router-dom';
import { uiState } from 'state/uiState';
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

  const validateTool = (tool: Tool): string | undefined => {
    if (!tool.name.trim()) {
      return 'Tool name is required';
    }

    const filenameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!filenameRegex.test(tool.name)) {
      return 'Tool name must be filename-compatible (letters, numbers, hyphens, underscores only)';
    }

    if (!tool.configYaml.trim()) {
      return 'YAML configuration is required';
    }

    try {
      if (!tool.configYaml.includes('meta:')) {
        return "YAML must include 'meta:' section";
      }
      if (!tool.configYaml.includes('mcp:')) {
        return "YAML must include 'mcp:' section under meta";
      }
      if (!tool.configYaml.includes('enabled: true')) {
        return "YAML must have 'enabled: true' under meta.mcp";
      }
      return undefined;
    } catch {
      return 'Invalid YAML format';
    }
  };

  const validateMetadata = () => {
    return displayName.trim() !== '';
  };

  const validateTools = () => {
    return tools.every((tool) => validateTool(tool) === undefined);
  };

  const handleSubmit = async () => {
    if (!validateMetadata() || !validateTools()) {
      return;
    }

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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link to="/remote-mcp">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to MCP Servers
            </Button>
          </Link>
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
