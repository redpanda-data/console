import { useDisclosure } from '@redpanda-data/ui';
import { cn } from 'components/redpanda-ui/lib/utils';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import type { editor } from 'monaco-editor';
import { memo, useCallback, useMemo, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useOnboardingWizardDataStore } from 'state/onboarding-wizard-store';

import { AddConnectorDialog } from './add-connector-dialog';
import { AddConnectorsCard } from './add-connectors-card';
import { AddContextualVariablesCard } from './add-contextual-variables-card';
import { AddSecretsCard } from './add-secrets-card';
import { AddSecretsDialog } from './add-secrets-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { getConnectTemplate } from '../utils/yaml';

const sidebarClassNames = 'w-[260px]';

type CreatePipelineSidebarProps = {
  editorInstance: editor.IStandaloneCodeEditor | null;
  editorContent: string;
  setYamlContent: (yaml: string) => void;
  components: ConnectComponentSpec[];
};

export const CreatePipelineSidebar = memo(
  ({ editorInstance, editorContent, setYamlContent, components }: CreatePipelineSidebarProps) => {
    const { isOpen: isAddConnectorOpen, onOpen: openAddConnector, onClose: closeAddConnector } = useDisclosure();
    const [selectedConnector, setSelectedConnector] = useState<ConnectComponentType | undefined>(undefined);
    const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);

    // Fetch secrets internally
    const { data: secretsResponse, refetch: refetchSecrets } = useListSecretsQuery({});
    const existingSecrets = useMemo(
      () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '') : []),
      [secretsResponse]
    );

    const detectedSecrets = useMemo(() => {
      if (!editorContent) {
        return [];
      }
      const references = extractSecretReferences(editorContent);
      return getUniqueSecretNames(references);
    }, [editorContent]);

    const hasInput = useMemo(() => editorContent.includes('input:'), [editorContent]);
    const hasOutput = useMemo(() => editorContent.includes('output:'), [editorContent]);

    const handleAddConnector = useCallback(
      (connectionName: string, connectionType: ConnectComponentType) => {
        const template = getConnectTemplate({
          connectionName,
          connectionType,
          existingYaml: editorContent,
          components,
        });

        if (template) {
          setYamlContent(template);

          // Sync wizard data to Zustand store
          const wizardData = useOnboardingWizardDataStore.getState();
          wizardData.setWizardData({
            ...wizardData,
            [connectionType]: {
              connectionName,
              connectionType,
            },
          });
        }
        closeAddConnector();
      },
      [editorContent, components, setYamlContent, closeAddConnector]
    );

    const existingSecretsSet = useMemo(() => new Set(existingSecrets), [existingSecrets]);
    const missingSecrets = useMemo(
      () => detectedSecrets.filter((secret) => !existingSecretsSet.has(secret)),
      [detectedSecrets, existingSecretsSet]
    );

    const handleSecretsCreated = useCallback(() => {
      refetchSecrets();
      setIsSecretsDialogOpen(false);
    }, [refetchSecrets]);

    if (editorInstance === null) {
      return <div className={sidebarClassNames} />;
    }

    const handleConnectorTypeChange = (connectorType: ConnectComponentType) => {
      setSelectedConnector(connectorType);
      openAddConnector();
    };

    return (
      <div className={cn(sidebarClassNames, 'flex flex-col gap-4')}>
        <AddConnectorsCard
          editorContent={editorContent}
          hasInput={hasInput}
          hasOutput={hasOutput}
          onAddConnector={handleConnectorTypeChange}
        />
        <AddSecretsCard
          detectedSecrets={detectedSecrets}
          editorInstance={editorInstance}
          existingSecrets={existingSecrets}
          missingSecrets={missingSecrets}
          onOpenDialog={() => setIsSecretsDialogOpen(true)}
        />
        <AddContextualVariablesCard editorContent={editorContent} editorInstance={editorInstance} />

        <AddSecretsDialog
          existingSecrets={existingSecrets}
          isOpen={isSecretsDialogOpen}
          missingSecrets={missingSecrets}
          onClose={() => setIsSecretsDialogOpen(false)}
          onSecretsCreated={handleSecretsCreated}
        />
        <AddConnectorDialog
          connectorType={selectedConnector}
          isOpen={isAddConnectorOpen}
          onAddConnector={handleAddConnector}
          onCloseAddConnector={closeAddConnector}
        />
      </div>
    );
  }
);
