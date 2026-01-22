/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { Markdown } from '@redpanda-data/ui';
import { getRouteApi } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from 'components/redpanda-ui/components/sheet';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { StringArrayInput } from 'components/ui/common/string-array-input';
import {
  AlertCircle,
  Code as CodeIcon,
  Edit,
  Link as LinkIcon,
  Plus,
  Save,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  AIAgent_AgentCard_ProviderSchema,
  AIAgent_AgentCard_SkillSchema,
  AIAgent_AgentCardSchema,
  AIAgentUpdateSchema,
  UpdateAIAgentRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useState } from 'react';
import { useGetA2ACodeSnippetQuery, useGetAIAgentQuery, useUpdateAIAgentMutation } from 'react-query/api/ai-agent';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import GoLogo from '../../../../assets/go.svg';
import JavaLogo from '../../../../assets/java.svg';
import NodeLogo from '../../../../assets/node.svg';
import PythonLogo from '../../../../assets/python.svg';

const routeApi = getRouteApi('/agents/$id');

const AVAILABLE_LANGUAGES = ['python', 'javascript', 'java', 'go', 'curl'] as const;

const getLanguageIcon = (language: string) => {
  switch (language) {
    case 'python':
      return PythonLogo;
    case 'javascript':
      return NodeLogo;
    case 'java':
      return JavaLogo;
    case 'go':
      return GoLogo;
    case 'curl':
      return 'terminal';
    default:
      return null;
  }
};

const getLanguageLabel = (language: string): string => {
  const labels: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    java: 'Java',
    go: 'Go',
    curl: 'cURL',
  };
  return labels[language] || language;
};

type AgentCard = {
  iconUrl: string;
  documentationUrl: string;
  provider?: {
    organization: string;
    url: string;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
  }>;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Agent card tab contains CRUD operations for agent card configuration with layout complexity
export const AIAgentCardTab = () => {
  const { id } = routeApi.useParams();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateAIAgent, isPending: isUpdatePending } = useUpdateAIAgentMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editedCard, setEditedCard] = useState<AgentCard | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('python');

  const { data: codeSnippetData, isLoading: isLoadingCodeSnippet } = useGetA2ACodeSnippetQuery({
    language: selectedLanguage,
  });

  const agent = aiAgentData?.aiAgent;

  if (!agent) {
    return null;
  }

  const displayCard: AgentCard = editedCard || {
    iconUrl: agent.agentCard?.iconUrl || '',
    documentationUrl: agent.agentCard?.documentationUrl || '',
    provider: agent.agentCard?.provider
      ? {
          organization: agent.agentCard.provider.organization || '',
          url: agent.agentCard.provider.url || '',
        }
      : undefined,
    skills:
      agent.agentCard?.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tags: skill.tags || [],
        examples: skill.examples || [],
      })) || [],
  };

  const updateField = (field: 'iconUrl' | 'documentationUrl', value: string) => {
    setEditedCard({
      ...displayCard,
      [field]: value,
    });
  };

  const updateProvider = (field: 'organization' | 'url', value: string) => {
    setEditedCard({
      ...displayCard,
      provider: {
        organization: displayCard.provider?.organization || '',
        url: displayCard.provider?.url || '',
        [field]: value,
      },
    });
  };

  const addSkill = () => {
    const newSkills = [...displayCard.skills, { id: '', name: '', description: '', tags: [], examples: [] }];
    setEditedCard({
      ...displayCard,
      skills: newSkills,
    });
  };

  const removeSkill = (index: number) => {
    setEditedCard({
      ...displayCard,
      skills: displayCard.skills.filter((_, i) => i !== index),
    });
  };

  const updateSkill = (
    index: number,
    field: 'id' | 'name' | 'description' | 'tags' | 'examples',
    value: string | string[]
  ) => {
    const updatedSkills = [...displayCard.skills];
    updatedSkills[index] = { ...updatedSkills[index], [field]: value };
    setEditedCard({
      ...displayCard,
      skills: updatedSkills,
    });
  };

  const handleSave = async () => {
    if (!id) {
      return;
    }

    try {
      const hasData = !!(
        displayCard.iconUrl ||
        displayCard.documentationUrl ||
        displayCard.skills.length > 0 ||
        displayCard.provider?.organization ||
        displayCard.provider?.url
      );

      const agentCard = hasData
        ? create(AIAgent_AgentCardSchema, {
            iconUrl: displayCard.iconUrl || undefined,
            documentationUrl: displayCard.documentationUrl || undefined,
            provider:
              displayCard.provider?.organization || displayCard.provider?.url
                ? create(AIAgent_AgentCard_ProviderSchema, {
                    organization: displayCard.provider.organization || undefined,
                    url: displayCard.provider.url || undefined,
                  })
                : undefined,
            skills: displayCard.skills.map((skill) =>
              create(AIAgent_AgentCard_SkillSchema, {
                id: skill.id.trim(),
                name: skill.name.trim(),
                description: skill.description.trim(),
                tags: skill.tags.filter((t: string) => t.trim()),
                examples: skill.examples.filter((e: string) => e.trim()),
              })
            ),
          })
        : undefined;

      await updateAIAgent(
        create(UpdateAIAgentRequestSchema, {
          id,
          aiAgent: create(AIAgentUpdateSchema, {
            displayName: agent.displayName,
            description: agent.description,
            model: agent.model,
            maxIterations: agent.maxIterations,
            provider: agent.provider,
            systemPrompt: agent.systemPrompt,
            serviceAccount: agent.serviceAccount,
            resources: agent.resources,
            mcpServers: agent.mcpServers,
            subagents: agent.subagents,
            tags: agent.tags,
            gateway: agent.gateway,
            agentCard,
          }),
          updateMask: create(FieldMaskSchema, {
            paths: [
              'agent_card.icon_url',
              'agent_card.documentation_url',
              'agent_card.provider.organization',
              'agent_card.provider.url',
              'agent_card.skills',
            ],
          }),
        }),
        {
          onSuccess: () => {
            toast.success('Agent card updated successfully');
            setIsEditing(false);
            setEditedCard(null);
          },
          onError: (error) => {
            toast.error(formatToastErrorMessageGRPC({ error, action: 'update', entity: 'agent card' }));
          },
        }
      );
    } catch {
      // Error already handled
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedCard(null);
  };

  const renderSkillField = (
    skill: AgentCard['skills'][number],
    index: number,
    field: 'id' | 'name' | 'description'
  ) => {
    const placeholders = {
      id: 'e.g., redpanda-cluster-info',
      name: 'e.g., Redpanda Cluster Information',
      description: 'Describe what this skill does...',
    };

    if (field === 'description') {
      return (
        <Textarea
          id={`skill-${field}-${index}`}
          onChange={(e) => updateSkill(index, field, e.target.value)}
          placeholder={placeholders[field]}
          rows={3}
          value={skill[field]}
        />
      );
    }
    return (
      <Input
        id={`skill-${field}-${index}`}
        onChange={(e) => updateSkill(index, field, e.target.value)}
        placeholder={placeholders[field]}
        value={skill[field]}
      />
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left Panel - Basic Information */}
      <div className="space-y-4 lg:col-span-2">
        {/* Agent Card */}
        <Card className="px-0 py-0" size="full">
          <CardHeader className="flex flex-row items-center justify-between border-b p-4 dark:border-border [.border-b]:pb-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <Text className="font-semibold">Agent Card</Text>
              </CardTitle>
              <Text className="text-muted-foreground text-sm">
                Configure optional metadata exposed via{' '}
                <a
                  className="underline hover:text-foreground"
                  href="https://a2a-protocol.org/latest/topics/key-concepts/#agent-cards"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  A2A protocol
                </a>{' '}
                for agent discovery and interoperability.
              </Text>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button disabled={isUpdatePending} onClick={handleSave} variant="secondary">
                    <Save className="h-4 w-4" />
                    {isUpdatePending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button onClick={handleCancel} variant="outline">
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={() => setIsEditing(true)} variant="secondary">
                  <Edit className="h-4 w-4" />
                  Edit Configuration
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-4 pb-4">
            {/* Identity Section */}
            <div className="space-y-4">
              <div>
                <Text className="font-medium">Identity</Text>
                <Text className="text-muted-foreground text-sm">
                  Visual branding and documentation for agent discovery interfaces
                </Text>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-card-icon-url">Icon URL</Label>
                  {isEditing ? (
                    <Input
                      id="agent-card-icon-url"
                      onChange={(e) => updateField('iconUrl', e.target.value)}
                      placeholder="https://example.com/icon.png"
                      value={displayCard.iconUrl}
                    />
                  ) : (
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text className="truncate" variant="default">
                        {displayCard.iconUrl}
                      </Text>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-card-documentation-url">Documentation URL</Label>
                  {isEditing ? (
                    <Input
                      id="agent-card-documentation-url"
                      onChange={(e) => updateField('documentationUrl', e.target.value)}
                      placeholder="https://docs.example.com"
                      value={displayCard.documentationUrl}
                    />
                  ) : (
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text className="truncate" variant="default">
                        {displayCard.documentationUrl}
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Provider Information */}
            <div className="space-y-4">
              <div>
                <Text className="font-medium">Provider</Text>
                <Text className="text-muted-foreground text-sm">
                  Organization that publishes and maintains this agent
                </Text>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-card-provider-org">Organization</Label>
                  {isEditing ? (
                    <Input
                      id="agent-card-provider-org"
                      onChange={(e) => updateProvider('organization', e.target.value)}
                      placeholder="Redpanda"
                      value={displayCard.provider?.organization || ''}
                    />
                  ) : (
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text variant="default">{displayCard.provider?.organization}</Text>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-card-provider-url">URL</Label>
                  {isEditing ? (
                    <Input
                      id="agent-card-provider-url"
                      onChange={(e) => updateProvider('url', e.target.value)}
                      placeholder="https://redpanda.com"
                      value={displayCard.provider?.url || ''}
                    />
                  ) : (
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <Text className="truncate" variant="default">
                        {displayCard.provider?.url}
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Skills Section */}
            <div className="space-y-4">
              <div>
                <Text className="font-medium">Capabilities</Text>
                <Text className="text-muted-foreground text-sm">
                  Skills that describe what this agent can do for capability-based discovery
                </Text>
              </div>

              {displayCard.skills.length === 0 && !isEditing ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <Text variant="muted">No skills configured</Text>
                </div>
              ) : (
                displayCard.skills.length > 0 && (
                  <div className="space-y-4">
                    {displayCard.skills.map((skill, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Using index as key
                      <div className="rounded-lg border p-4" key={`skill-${index}`}>
                        <div className="mb-4 flex items-start justify-between">
                          <div className="flex-1">
                            <Text className="font-medium">{skill.name || `Skill ${index + 1}`}</Text>
                            {Boolean(skill.id) && <Text className="text-muted-foreground text-sm">ID: {skill.id}</Text>}
                          </div>
                          {Boolean(isEditing) && (
                            <Button onClick={() => removeSkill(index)} size="sm" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="space-y-4">
                          {Boolean(isEditing) && (
                            <>
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor={`skill-id-${index}`}>
                                    Skill ID <span className="text-red-500">*</span>
                                  </Label>
                                  {renderSkillField(skill, index, 'id')}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`skill-name-${index}`}>
                                    Skill Name <span className="text-red-500">*</span>
                                  </Label>
                                  {renderSkillField(skill, index, 'name')}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`skill-description-${index}`}>
                                  Description <span className="text-red-500">*</span>
                                </Label>
                                {renderSkillField(skill, index, 'description')}
                              </div>
                              <div className="space-y-2">
                                <Label>Tags</Label>
                                <StringArrayInput
                                  onChange={(newTags) => updateSkill(index, 'tags', newTags)}
                                  placeholder="Add tag and press Enter"
                                  value={skill.tags}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Examples</Label>
                                <div className="space-y-2">
                                  {skill.examples.map((example, exampleIndex) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Using index as key for examples
                                    <div className="flex gap-2" key={`example-${exampleIndex}`}>
                                      <Textarea
                                        onChange={(e) => {
                                          const newExamples = [...skill.examples];
                                          newExamples[exampleIndex] = e.target.value;
                                          updateSkill(index, 'examples', newExamples);
                                        }}
                                        placeholder="Enter example prompt"
                                        rows={4}
                                        value={example}
                                      />
                                      <Button
                                        onClick={() => {
                                          const newExamples = skill.examples.filter((_, i) => i !== exampleIndex);
                                          updateSkill(index, 'examples', newExamples);
                                        }}
                                        size="sm"
                                        variant="ghost"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    onClick={() => {
                                      updateSkill(index, 'examples', [...skill.examples, '']);
                                    }}
                                    size="sm"
                                    variant="outline"
                                  >
                                    <Plus className="h-4 w-4" />
                                    Add Example
                                  </Button>
                                </div>
                              </div>
                            </>
                          )}
                          {!isEditing && (
                            <>
                              {Boolean(skill.description) && (
                                <div className="space-y-1">
                                  <Label>Description</Label>
                                  <Text className="text-muted-foreground text-sm">{skill.description}</Text>
                                </div>
                              )}
                              <div className="space-y-1">
                                <Label className="text-xs">Tags</Label>
                                <Text className="text-sm">
                                  {skill.tags.length > 0 ? skill.tags.join(', ') : 'None'}
                                </Text>
                              </div>
                              {skill.examples.length > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-xs">Examples</Label>
                                  <div className="space-y-2">
                                    {skill.examples.map((example, exampleIndex) => (
                                      <div
                                        className="rounded-md border border-gray-200 bg-gray-50 p-3"
                                        // biome-ignore lint/suspicious/noArrayIndexKey: Using index as key for examples
                                        key={`view-example-${exampleIndex}`}
                                      >
                                        <Text className="whitespace-pre-wrap text-sm">{example}</Text>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {Boolean(isEditing) && (
                <Button className="w-full" onClick={addSkill} type="button" variant="dashed">
                  <Plus className="h-4 w-4" />
                  Add Skill
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column */}
      <div className="space-y-4 lg:col-span-1">
        {/* Connection Information Card */}
        <Card className="px-0 py-0" size="full">
          <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                <Text className="font-semibold">Connect</Text>
              </CardTitle>
              <Text className="text-muted-foreground text-sm">Use client SDKs to connect to the agent</Text>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4">
            <div className="space-y-2">
              <Label>Agent URL</Label>
              {agent.url ? (
                <DynamicCodeBlock code={agent.url} lang="text" />
              ) : (
                <Text variant="muted">URL not available</Text>
              )}
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="flex-1 space-y-1">
                  <Text className="font-semibold text-blue-900 text-sm dark:text-blue-100">
                    Authentication Required
                  </Text>
                  <Text className="text-blue-800 text-sm dark:text-blue-200">
                    This agent requires a Redpanda Cloud M2M token for authentication.{' '}
                    <a className="underline" href="/organization-iam?tab=service-accounts">
                      Create an M2M token
                    </a>{' '}
                    to connect.
                  </Text>
                </div>
              </div>
            </div>

            {/* Code Examples Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <CodeIcon className="h-4 w-4" />
                <Label>Code Examples</Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_LANGUAGES.map((language) => {
                  const icon = getLanguageIcon(language);
                  return (
                    <Sheet key={language}>
                      <SheetTrigger asChild>
                        <Button
                          className="flex h-16 flex-shrink-1 flex-col items-center justify-center hover:bg-muted/50"
                          onClick={() => setSelectedLanguage(language)}
                          variant="outline"
                        >
                          {icon === 'terminal' ? <Terminal className="h-8 w-8" /> : <img alt={language} src={icon} />}
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="w-full overflow-y-auto sm:max-w-6xl" side="right">
                        <SheetHeader>
                          <SheetTitle>{getLanguageLabel(language)} Example</SheetTitle>
                        </SheetHeader>
                        <div className="mt-4">
                          {isLoadingCodeSnippet ? (
                            <div className="flex items-center justify-center p-8">
                              <Text variant="muted">Loading code snippet...</Text>
                            </div>
                          ) : (
                            <Markdown showLineNumbers>
                              {codeSnippetData?.replaceAll('<agent-url>', agent.url || '<agent-url>') || ''}
                            </Markdown>
                          )}
                        </div>
                      </SheetContent>
                    </Sheet>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
