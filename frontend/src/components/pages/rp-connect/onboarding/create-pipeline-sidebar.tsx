import { useDisclosure } from '@redpanda-data/ui';
import type { editor } from 'monaco-editor';
import { memo, useMemo, useState } from 'react';

import { AddConnectorDialog } from './add-connector-dialog';
import { AddConnectorsCard } from './add-connectors-card';
import { AddSecretsCard } from './add-secrets-card';
import { AddSecretsDialog } from './add-secrets-dialog';
import type { ConnectComponentType } from '../types/schema';

interface CreatePipelineSidebarProps {
  editorInstance: editor.IStandaloneCodeEditor | null;
  onAddConnector: ((connectionName: string, connectionType: ConnectComponentType) => void) | undefined;
  detectedSecrets: string[];
  existingSecrets: string[];
  secretDefaultValues: Record<string, string>;
  onSecretsCreated: () => void;
  editorContent: string;
}

export const CreatePipelineSidebar = memo(
  ({
    editorInstance,
    onAddConnector,
    detectedSecrets,
    existingSecrets,
    secretDefaultValues,
    onSecretsCreated,
    editorContent,
  }: CreatePipelineSidebarProps) => {
    const { isOpen: isAddConnectorOpen, onOpen: openAddConnector, onClose: closeAddConnector } = useDisclosure();
    const [selectedConnector, setSelectedConnector] = useState<ConnectComponentType | undefined>(undefined);
    const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);

    const hasInput = useMemo(() => editorContent.includes('input:'), [editorContent]);
    const hasOutput = useMemo(() => editorContent.includes('output:'), [editorContent]);

    if (editorInstance === null) {
      return <div className="min-w-[300px]" />;
    }

    const handleConnectorTypeChange = (connectorType: ConnectComponentType) => {
      setSelectedConnector(connectorType);
      openAddConnector();
    };

    const handleAddConnector = (connectionName: string, connectionType: ConnectComponentType) => {
      onAddConnector?.(connectionName, connectionType);
      closeAddConnector();
    };

    // Separate existing and missing secrets
    const existingSecretsSet = new Set(existingSecrets);
    const missingSecrets = detectedSecrets.filter((secret) => !existingSecretsSet.has(secret));

    const handleSecretsCreated = () => {
      onSecretsCreated();
      setIsSecretsDialogOpen(false);
    };

    return (
      <div className="flex gap-3 flex-col">
        <AddSecretsCard
          detectedSecrets={detectedSecrets}
          missingSecrets={missingSecrets}
          existingSecrets={existingSecrets}
          editorInstance={editorInstance}
          onOpenDialog={() => setIsSecretsDialogOpen(true)}
        />

        <AddSecretsDialog
          isOpen={isSecretsDialogOpen}
          onClose={() => setIsSecretsDialogOpen(false)}
          missingSecrets={missingSecrets}
          existingSecrets={existingSecrets}
          defaultValues={secretDefaultValues}
          onSecretsCreated={handleSecretsCreated}
        />

        <AddConnectorsCard onAddConnector={handleConnectorTypeChange} hasInput={hasInput} hasOutput={hasOutput} />

        <AddConnectorDialog
          isOpen={isAddConnectorOpen}
          onCloseAddConnector={closeAddConnector}
          onAddConnector={handleAddConnector}
          connectorType={selectedConnector}
        />
      </div>
    );
  },
);
