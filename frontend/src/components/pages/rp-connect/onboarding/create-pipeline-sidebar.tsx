import { useDisclosure } from '@redpanda-data/ui';
import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';
import type { editor } from 'monaco-editor';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo, useState } from 'react';
import { useOnboardingWizardDataStore } from 'state/onboarding-wizard-store';

import { AddConnectorDialog } from './add-connector-dialog';
import { AddConnectorsCard } from './add-connectors-card';
import { AddContextualVariablesCard } from './add-contextual-variables-card';
import { AddSecretsCard } from './add-secrets-card';
import type { ConnectComponentType } from '../types/schema';
import { parseSchema } from '../utils/schema';
import { getConnectTemplate } from '../utils/yaml';

type CreatePipelineSidebarProps = {
  editorInstance: editor.IStandaloneCodeEditor | null;
  editorContent: string;
  setYamlContent: (yaml: string) => void;
  componentList?: ComponentList;
  isComponentListLoading?: boolean;
};

export const CreatePipelineSidebar = memo(
  ({
    editorInstance,
    editorContent,
    setYamlContent,
    componentList: rawComponentList,
    isComponentListLoading,
  }: CreatePipelineSidebarProps) => {
    const { isOpen: isAddConnectorOpen, onOpen: openAddConnector, onClose: closeAddConnector } = useDisclosure();
    const [selectedConnector, setSelectedConnector] = useState<ConnectComponentType | undefined>(undefined);
    const components = useMemo(() => (rawComponentList ? parseSchema(rawComponentList) : []), [rawComponentList]);

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

    if (editorInstance === null) {
      return null;
    }

    const handleConnectorTypeChange = (connectorType: ConnectComponentType) => {
      setSelectedConnector(connectorType);
      openAddConnector();
    };

    if (isComponentListLoading) {
      return (
        <div className="flex flex-col gap-4">
          <SkeletonGroup direction="vertical" spacing="default">
            <Skeleton variant="heading" width="full" />
            <Skeleton className="h-10 w-full" />
          </SkeletonGroup>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <AddConnectorsCard
          editorContent={editorContent}
          hasInput={hasInput}
          hasOutput={hasOutput}
          onAddConnector={handleConnectorTypeChange}
        />
        <AddSecretsCard editorContent={editorContent} editorInstance={editorInstance} />
        <AddContextualVariablesCard editorContent={editorContent} editorInstance={editorInstance} />

        {rawComponentList ? (
          <AddConnectorDialog
            components={rawComponentList}
            connectorType={selectedConnector}
            isOpen={isAddConnectorOpen}
            onAddConnector={handleAddConnector}
            onCloseAddConnector={closeAddConnector}
          />
        ) : null}
      </div>
    );
  }
);
