import { AlertTriangle, Code2, ExternalLink, Maximize2, Plus, Upload, X } from 'lucide-react';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../../redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../redpanda-ui/components/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../redpanda-ui/components/dialog';
import { Input } from '../../../../redpanda-ui/components/input';
import { Label } from '../../../../redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../redpanda-ui/components/select';
import { Textarea } from '../../../../redpanda-ui/components/textarea';
import type { Tool } from '../remote-mcp-create-page';

const yamlTemplates = {
  processor: {
    'search-tool': `name: search-posts
description: Search through blog posts and articles
meta:
  mcp:
    enabled: true

pipeline:
  processors:
    - mapping: |
        root.query = this.query
        root.limit = this.limit.or(10)
        
spec:
  description: "Search through posts and articles"
  parameters:
    query:
      type: string
      description: Search query
      required: true
    limit:
      type: integer
      description: Maximum number of results
      default: 10`,
    'api-tool': `name: api-call
description: Make API calls to external services
meta:
  mcp:
    enabled: true

pipeline:
  processors:
    - http:
        url: \${! this.endpoint }
        verb: \${! this.method.or("GET") }
        
spec:
  description: "Make API calls to external services"
  parameters:
    endpoint:
      type: string
      description: API endpoint URL
      required: true
    method:
      type: string
      description: HTTP method
      default: GET`,
    'data-tool': `name: data-processor
description: Process and transform data
meta:
  mcp:
    enabled: true

pipeline:
  processors:
    - mapping: |
        root = this.input
        
spec:
  description: "Process and transform data"
  parameters:
    input:
      type: object
      description: Input data to process
      required: true`,
  },
  cache: {
    'get-item': `name: get-content
description: Retrieve cached content by key
meta:
  mcp:
    enabled: true

cache_resources:
  - label: "content_cache"
    memory:
      default_ttl: "5m"

pipeline:
  processors:
    - cache:
        resource: "content_cache"
        operator: "get"
        key: \${! this.key }
        
spec:
  description: "Retrieve cached content"
  parameters:
    key:
      type: string
      description: Cache key
      required: true`,
    'set-item': `name: set-content
description: Store content in cache
meta:
  mcp:
    enabled: true

cache_resources:
  - label: "content_cache"
    memory:
      default_ttl: "5m"

pipeline:
  processors:
    - cache:
        resource: "content_cache"
        operator: "set"
        key: \${! this.key }
        value: \${! this.value }
        
spec:
  description: "Store content in cache"
  parameters:
    key:
      type: string
      description: Cache key
      required: true
    value:
      type: string
      description: Content to cache
      required: true`,
    'list-items': `name: list-cached
description: List all cached items
meta:
  mcp:
    enabled: true

cache_resources:
  - label: "content_cache"
    memory:
      default_ttl: "5m"

pipeline:
  processors:
    - mapping: |
        root.items = []
        # List operation would need custom logic
        
spec:
  description: "List all cached items"
  parameters:
    prefix:
      type: string
      description: Key prefix filter
      required: false`,
  },
};

interface ToolsStepProps {
  tools: Tool[];
  setTools: (tools: Tool[]) => void;
  expandedEditor: string | null;
  setExpandedEditor: (id: string | null) => void;
}

export const RemoteMCPCreateToolsStep = ({ tools, setTools, expandedEditor, setExpandedEditor }: ToolsStepProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTool = () => {
    setTools([
      ...tools,
      {
        id: Date.now().toString(),
        name: '',
        componentType: MCPServer_Tool_ComponentType.PROCESSOR,
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

          if (field === 'componentType' && value !== tool.componentType) {
            const templateKey = value === MCPServer_Tool_ComponentType.PROCESSOR ? 'processor' : 'cache';
            const templates = yamlTemplates[templateKey];
            const firstTemplate = Object.values(templates)[0];
            updatedTool.configYaml = firstTemplate;
          }

          updatedTool.validationError = validateTool(updatedTool);
          return updatedTool;
        }
        return tool;
      }),
    );
  };

  const insertTemplate = (toolId: string, template: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (tool) {
      const templateKey = tool.componentType === MCPServer_Tool_ComponentType.PROCESSOR ? 'processor' : 'cache';
      const templates = yamlTemplates[templateKey];
      updateTool(toolId, 'configYaml', templates[template as keyof typeof templates]);
    }
  };

  const validateYaml = (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (tool) {
      const error = validateTool(tool);
      setTools(tools.map((t) => (t.id === toolId ? { ...t, validationError: error } : t)));
    }
  };

  const formatYaml = (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (tool?.configYaml) {
      const lines = tool.configYaml.split('\n');
      const formatted = lines
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed.includes(':') && !trimmed.startsWith('-')) {
            const [key, ...rest] = trimmed.split(':');
            const value = rest.join(':').trim();
            const indent = line.length - line.trimStart().length;
            return `${' '.repeat(indent)}${key}: ${value}`;
          }
          return line;
        })
        .join('\n');
      updateTool(toolId, 'configYaml', formatted);
    }
  };

  const importFromFile = (toolId: string) => {
    fileInputRef.current?.click();
    if (fileInputRef.current) {
      fileInputRef.current.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            updateTool(toolId, 'configYaml', content);
          };
          reader.readAsText(file);
        }
      };
    }
  };

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

  return (
    <>
      <input type="file" ref={fileInputRef} className="hidden" accept=".yaml,.yml" />

      <div className="space-y-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Tools Configuration</h2>
          <p className="text-gray-600 mb-4">
            Define the tools that your MCP server will provide. Each tool requires a name, component type, and YAML
            configuration.
          </p>
        </div>

        {tools.map((tool, index) => (
          <Card key={tool.id} className="max-w-full">
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
                    className={tool.validationError?.includes('name') ? 'border-red-300' : ''}
                  />
                  <p className="text-xs text-gray-500">
                    Lowercase letters, numbers, and dashes. Used in the file name and API.
                  </p>
                </div>

                <div className="flex-1 space-y-2">
                  <Label>Component Type</Label>
                  <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50 h-10">
                    <button
                      type="button"
                      onClick={() => updateTool(tool.id, 'componentType', MCPServer_Tool_ComponentType.PROCESSOR)}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        tool.componentType === MCPServer_Tool_ComponentType.PROCESSOR
                          ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Processor
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTool(tool.id, 'componentType', MCPServer_Tool_ComponentType.CACHE)}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        tool.componentType === MCPServer_Tool_ComponentType.CACHE
                          ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Cache
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {tool.componentType === MCPServer_Tool_ComponentType.PROCESSOR
                      ? 'Transform and manipulate content, make API calls, process data.'
                      : 'Store and retrieve data, manage cached content and state.'}{' '}
                    <Link to="#" className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                      Learn more <ExternalLink className="h-3 w-3" />
                    </Link>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>YAML Configuration</Label>
                  <div className="flex gap-2">
                    <Select onValueChange={(value) => insertTemplate(tool.id, value)}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Insert template" />
                      </SelectTrigger>
                      <SelectContent>
                        {tool.componentType === MCPServer_Tool_ComponentType.PROCESSOR ? (
                          <>
                            <SelectItem value="search-tool">Search Tool</SelectItem>
                            <SelectItem value="api-tool">API Tool</SelectItem>
                            <SelectItem value="data-tool">Data Tool</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="get-item">Get Item</SelectItem>
                            <SelectItem value="set-item">Set Item</SelectItem>
                            <SelectItem value="list-items">List Items</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

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
                        onClick={() => validateYaml(tool.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Validate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => formatYaml(tool.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Format
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => importFromFile(tool.id)}
                        className="h-7 px-2 text-xs gap-1"
                      >
                        <Upload className="h-3 w-3" />
                        Import
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
                  <Textarea
                    value={tool.configYaml}
                    onChange={(e) => updateTool(tool.id, 'configYaml', e.target.value)}
                    placeholder="Enter YAML configuration..."
                    rows={8}
                    className={`font-mono text-sm border-0 rounded-t-none resize-none ${
                      tool.validationError?.includes('YAML') ? 'border-red-300' : ''
                    }`}
                  />
                </div>

                {tool.validationError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {tool.validationError}
                  </div>
                )}

                <p className="text-xs text-gray-500">Required: non-empty YAML with meta.mcp.enabled=true</p>
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
              <p id="yaml-editor-description" className="text-sm text-gray-600">
                Edit your YAML configuration in this expanded editor. Use the buttons below to validate, format, or
                import from a file.
              </p>
              <div className="flex gap-2">
                {/* <Button variant="outline" size="sm" onClick={() => validateYaml(expandedEditor)}>
                  Validate
                </Button>
                <Button variant="outline" size="sm" onClick={() => formatYaml(expandedEditor)}>
                  Format
                </Button> */}
                <Button variant="outline" size="sm" onClick={() => importFromFile(expandedEditor)} className="gap-1">
                  <Upload className="h-3 w-3" />
                  Import File
                </Button>
              </div>
              <Textarea
                value={tools.find((t) => t.id === expandedEditor)?.configYaml || ''}
                onChange={(e) => updateTool(expandedEditor, 'configYaml', e.target.value)}
                className="font-mono text-sm min-h-[400px]"
                placeholder="Enter YAML configuration..."
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
