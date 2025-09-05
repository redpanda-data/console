import { create } from '@bufbuild/protobuf';
import { YamlEditor } from 'components/misc/yaml-editor';
import { formatPipelineError } from 'components/pages/rp-connect/errors';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { AlertTriangle, Code2, ExternalLink, Maximize2, PencilRuler, Plus, X } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import {
  LintMCPConfigRequestSchema,
  MCPServer_Tool_ComponentType,
  MCPServer_ToolSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useRef } from 'react';
import { useLintMCPConfigMutation } from 'react-query/api/remote-mcp';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { RemoteMCPToolTypeBadge } from '../../remote-mcp-tool-type-badge';
import type { Tool } from '../remote-mcp-create-page';

interface ToolsStepProps {
  tools: Tool[];
  setTools: (tools: Tool[]) => void;
  expandedEditor: string | null;
  setExpandedEditor: (id: string | null) => void;
}

export const RemoteMCPCreateToolsStep = ({ tools, setTools, expandedEditor, setExpandedEditor }: ToolsStepProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: lintMCPConfig, isPending: isLinting } = useLintMCPConfigMutation();

  const addTool = () => {
    setTools([
      ...tools,
      {
        id: Date.now().toString(),
        name: '',
        componentType: undefined,
        configYaml: '',
        validationError: undefined,
      },
    ]);
  };

  const removeTool = (id: string) => {
    if (tools.length > 1) {
      setTools(tools.filter((tool) => tool.id !== id));
    }
  };

  const updateTool = (
    id: string,
    field: 'name' | 'componentType' | 'configYaml',
    value: string | MCPServer_Tool_ComponentType,
  ) => {
    setTools(
      tools.map((tool) => {
        if (tool.id === id) {
          const updatedTool = { ...tool, [field]: value };

          updatedTool.validationError = validateToolBasic(updatedTool);
          return updatedTool;
        }
        return tool;
      }),
    );
  };

  const validateYaml = async (tool: Tool) => {
    if (!tool) return;

    // Basic client-side validation first
    const basicError = validateToolBasic(tool);
    if (basicError) {
      setTools(tools.map((t) => (t.id === tool.id ? { ...t, validationError: basicError } : t)));
      return;
    }

    try {
      const request = create(LintMCPConfigRequestSchema, {
        tools: {
          [tool.name]: create(MCPServer_ToolSchema, {
            componentType: tool.componentType,
            configYaml: tool.configYaml,
          }),
        },
      });

      const response = await lintMCPConfig(request);

      // Check if there are any lint hints for this tool
      const toolLintHints = response.lintHints[tool.name];
      if (toolLintHints) {
        const lintHint = toolLintHints as LintHint;
        setTools(tools.map((t) => (t.id === tool.id ? { ...t, validationError: lintHint.hint } : t)));
      } else {
        // No lint errors - clear any existing error
        setTools(tools.map((t) => (t.id === tool.id ? { ...t, validationError: undefined } : t)));
      }
    } catch (error) {
      // On API error, use formatPipelineError to show detailed error information
      const formattedError = formatPipelineError(error);

      // Show error as toast notification
      toast.error(formattedError);

      // Also set the error inline for the specific tool
      setTools(tools.map((t) => (t.id === tool.id ? { ...t, validationError: formattedError } : t)));
    }
  };

  const validateToolBasic = (tool: Tool): string | undefined => {
    if (!tool.name.trim()) {
      return 'Tool name is required';
    }

    const filenameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!filenameRegex.test(tool.name)) {
      return 'Tool name must be filename-compatible (letters, numbers, hyphens, underscores only)';
    }

    if (tool.componentType === undefined) {
      return 'Component type is required';
    }

    if (!tool.configYaml.trim()) {
      return 'YAML configuration is required';
    }

    return undefined;
  };

  return (
    <>
      <input type="file" ref={fileInputRef} className="hidden" accept=".yaml,.yml" />

      <div className="space-y-6">
        <div className="mb-6">
          <Heading level={2} className="text-gray-900 mb-2">
            Tools Configuration
          </Heading>
          <Text className="text-gray-600 mb-4">
            Define the tools that your MCP server will provide. Each tool requires a name, component type, and YAML
            configuration.
          </Text>
        </div>

        {tools.map((tool, index) => (
          <Card key={tool.id} className="max-w-full px-8 py-6">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Tool {index + 1}</CardTitle>
                {tools.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTool(tool.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label>Tool Name</Label>
                  <Input
                    value={tool.name}
                    onChange={(e) => updateTool(tool.id, 'name', e.target.value)}
                    placeholder="search-posts"
                    className={
                      typeof tool.validationError === 'string' && tool.validationError.includes('name')
                        ? 'border-red-300'
                        : ''
                    }
                  />
                  <Text variant="small" className="text-gray-500">
                    Lowercase letters, numbers, and dashes. Used in the file name and API.
                  </Text>
                </div>

                <div className="flex-1 space-y-2">
                  <Label>Component Type</Label>
                  <Select
                    value={tool.componentType?.toString() ?? ''}
                    onValueChange={(value) =>
                      updateTool(tool.id, 'componentType', Number.parseInt(value) as MCPServer_Tool_ComponentType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select component type">
                        {tool.componentType && <RemoteMCPToolTypeBadge componentType={tool.componentType} />}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MCPServer_Tool_ComponentType.PROCESSOR.toString()}>
                        <RemoteMCPToolTypeBadge componentType={MCPServer_Tool_ComponentType.PROCESSOR} />
                      </SelectItem>
                      <SelectItem value={MCPServer_Tool_ComponentType.CACHE.toString()}>
                        <RemoteMCPToolTypeBadge componentType={MCPServer_Tool_ComponentType.CACHE} />
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Text variant="small" className="text-gray-500">
                    {tool.componentType === MCPServer_Tool_ComponentType.PROCESSOR
                      ? 'Transform and manipulate content, make API calls, process data.'
                      : tool.componentType === MCPServer_Tool_ComponentType.CACHE
                        ? 'Store and retrieve data, manage cached content and state.'
                        : 'Choose the type of component this tool will use.'}{' '}
                    <Link to="#" className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                      Learn more <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Text>
                </div>
              </div>

              <div className="space-y-2">
                <div className="relative border rounded-lg">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Code2 className="h-4 w-4" />
                      YAML Configuration
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => validateYaml(tool)}
                        className="h-7 px-2 text-xs gap-1"
                      >
                        <PencilRuler className="h-3 w-3" />
                        {isLinting ? 'Linting...' : 'Lint'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedEditor(tool.id)}
                        className="h-7 px-2 text-xs gap-1"
                      >
                        <Maximize2 className="h-3 w-3" />
                        Expand
                      </Button>
                    </div>
                  </div>
                  <div className="h-48 border-0 rounded-t-none overflow-hidden">
                    <YamlEditor
                      value={tool.configYaml}
                      onChange={(value) => updateTool(tool.id, 'configYaml', value || '')}
                      options={{
                        theme: 'vs',
                      }}
                    />
                  </div>
                </div>

                {tool.validationError && (
                  <div className="flex items-start gap-2 text-red-600 text-sm">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>{tool.validationError}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button onClick={addTool} variant="outline" className="w-full gap-2 bg-transparent">
          <Plus className="h-4 w-4" />
          Add Tool
        </Button>
      </div>

      <Dialog open={expandedEditor !== null} onOpenChange={() => setExpandedEditor(null)}>
        <DialogContent size="xl" className="max-h-[80vh]" aria-describedby="yaml-editor-description">
          <DialogHeader>
            <DialogTitle>YAML Configuration Editor</DialogTitle>
          </DialogHeader>
          {expandedEditor && (
            <div className="space-y-4">
              <div className="overflow-hidden" style={{ height: '500px' }}>
                <YamlEditor
                  value={tools.find((t) => t.id === expandedEditor)?.configYaml || ''}
                  onChange={(value) => updateTool(expandedEditor, 'configYaml', value || '')}
                  options={{
                    theme: 'vs',
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
