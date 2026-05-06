/**
 * Copyright 2026 Redpanda Data, Inc.
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
import { getRouteApi } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Text } from 'components/redpanda-ui/components/typography';
import { SecretSelector } from 'components/ui/secret/secret-selector';
import { Edit, Save } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  AIAgentTeamsBridgeSchema,
  AIAgentUpdateSchema,
  UpdateAIAgentRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useMemo, useState } from 'react';
import { useGetAIAgentQuery, useUpdateAIAgentMutation } from 'react-query/api/ai-agent';
import { useListSecretsQuery } from 'react-query/api/secret';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

const routeApi = getRouteApi('/agents/$id/');

const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

const TEAMS_SECRET_TEXT = {
  dialogDescription: 'Create a new secret for your Microsoft Teams bot client secret.',
  secretNamePlaceholder: 'e.g., TEAMS_CLIENT_SECRET',
  secretValuePlaceholder: 'Enter your client secret...',
  secretValueDescription: 'Your Microsoft Teams bot application client secret',
  emptyStateDescription: 'Create a secret to securely store your Teams bot client secret',
};

type TeamsBridgeState = {
  enabled: boolean;
  botAppId: string;
  botTenantId: string;
  botAppSecretName: string;
};

const extractSecretName = (ref: string): string => {
  const match = ref.match(SECRET_TEMPLATE_REGEX);
  return match ? match[1] : '';
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Integrations tab with edit/view mode conditionals
export const AIAgentIntegrationsTab = () => {
  const { id } = routeApi.useParams();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });
  const { mutateAsync: updateAIAgent, isPending: isUpdatePending } = useUpdateAIAgentMutation();
  const { data: secretsData } = useListSecretsQuery();

  const [isEditing, setIsEditing] = useState(false);
  const [editedState, setEditedState] = useState<TeamsBridgeState | null>(null);

  const agent = aiAgentData?.aiAgent;

  const availableSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets
      .filter((secret): secret is NonNullable<typeof secret> & { id: string } => !!secret?.id)
      .map((secret) => ({ id: secret.id, name: secret.id }));
  }, [secretsData]);

  if (!agent) {
    return null;
  }

  const displayState: TeamsBridgeState = editedState || {
    enabled: agent.teamsBridge?.enabled ?? false,
    botAppId: agent.teamsBridge?.botAppId ?? '',
    botTenantId: agent.teamsBridge?.botTenantId ?? '',
    botAppSecretName: extractSecretName(agent.teamsBridge?.botAppSecretRef ?? ''),
  };

  const updateField = (updates: Partial<TeamsBridgeState>) => {
    setEditedState({ ...displayState, ...updates });
  };

  const handleSave = async () => {
    if (!id) {
      return;
    }

    const secretRef = displayState.botAppSecretName ? `\${secrets.${displayState.botAppSecretName}}` : '';

    try {
      await updateAIAgent(
        create(UpdateAIAgentRequestSchema, {
          id,
          aiAgent: create(AIAgentUpdateSchema, {
            teamsBridge: create(AIAgentTeamsBridgeSchema, {
              enabled: displayState.enabled,
              botAppId: displayState.botAppId,
              botTenantId: displayState.botTenantId,
              botAppSecretRef: secretRef || undefined,
            }),
          }),
          updateMask: create(FieldMaskSchema, {
            paths: [
              'teams_bridge.enabled',
              'teams_bridge.bot_app_id',
              'teams_bridge.bot_tenant_id',
              'teams_bridge.bot_app_secret_ref',
            ],
          }),
        }),
        {
          onSuccess: () => {
            toast.success('Teams integration updated');
            setIsEditing(false);
            setEditedState(null);
          },
          onError: (error) => {
            toast.error(formatToastErrorMessageGRPC({ error, action: 'update', entity: 'Teams integration' }));
          },
        }
      );
    } catch {
      // Error already handled
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedState(null);
  };

  return (
    <div className="space-y-4">
      <Card className="px-0 py-0" size="full">
        <CardHeader className="flex flex-row items-center justify-between border-b p-4 dark:border-border [.border-b]:pb-4">
          <div className="space-y-1">
            <CardTitle>
              <Text className="font-semibold">Microsoft Teams</Text>
            </CardTitle>
            <Text className="text-muted-foreground text-sm">
              Connect this agent to Microsoft Teams to enable conversational interactions through a Teams bot.
            </Text>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button disabled={isUpdatePending} onClick={handleSave} variant="primary">
                  <Save className="h-4 w-4" />
                  {isUpdatePending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button onClick={handleCancel} variant="outline">
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} variant="primary">
                <Edit className="h-4 w-4" />
                Edit Configuration
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-4 pb-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="teams-enabled">Enable Teams Integration</Label>
              <Text className="text-muted-foreground text-sm">Activate the Microsoft Teams bridge for this agent</Text>
            </div>
            {isEditing ? (
              <Switch
                checked={displayState.enabled}
                id="teams-enabled"
                onCheckedChange={(checked) => updateField({ enabled: checked })}
              />
            ) : (
              <Text className="font-medium text-sm">{displayState.enabled ? 'Enabled' : 'Disabled'}</Text>
            )}
          </div>

          {/* Bot configuration fields */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="teams-bot-app-id">Application (client) ID</Label>
              {isEditing ? (
                <Input
                  id="teams-bot-app-id"
                  onChange={(e) => updateField({ botAppId: e.target.value })}
                  placeholder="e.g., 12345678-abcd-efgh-ijkl-123456789012"
                  value={displayState.botAppId}
                />
              ) : (
                <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <Text className="truncate">{displayState.botAppId || '-'}</Text>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="teams-bot-tenant-id">Tenant ID</Label>
              {isEditing ? (
                <Input
                  id="teams-bot-tenant-id"
                  onChange={(e) => updateField({ botTenantId: e.target.value })}
                  placeholder="e.g., 12345678-abcd-efgh-ijkl-123456789012"
                  value={displayState.botTenantId}
                />
              ) : (
                <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <Text className="truncate">{displayState.botTenantId || '-'}</Text>
                </div>
              )}
            </div>
          </div>

          {/* Client Secret */}
          <div className="space-y-2">
            <Label>Client Secret</Label>
            {isEditing ? (
              <div className="[&>div]:flex-col [&>div]:items-stretch [&>div]:gap-2">
                <SecretSelector
                  availableSecrets={availableSecrets}
                  customText={TEAMS_SECRET_TEXT}
                  onChange={(value) => updateField({ botAppSecretName: value })}
                  placeholder="Select from secrets store or create new"
                  scopes={[Scope.AI_AGENT]}
                  value={displayState.botAppSecretName}
                />
              </div>
            ) : (
              <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <Text className="truncate">{displayState.botAppSecretName || '-'}</Text>
              </div>
            )}
          </div>

          {/* Messaging endpoint URL - populated by the bridge controller */}
          {Boolean(agent.teamsBridgeEndpoint) && (
            <div className="space-y-2">
              <Label>Messaging Endpoint</Label>
              <Text className="text-muted-foreground text-sm">
                Configure this URL as the messaging endpoint in your Azure Bot registration.
              </Text>
              <DynamicCodeBlock code={agent.teamsBridgeEndpoint ?? ''} lang="text" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
