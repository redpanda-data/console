import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { ConnectCommandPalette } from './connect-command-palette';
import type { ConnectComponentType } from '../types/schema';

export const AddConnectorDialog = ({
  isOpen,
  onCloseAddConnector,
  connectorType,
  onAddConnector,
  components,
  title,
  searchPlaceholder,
}: {
  isOpen: boolean;
  onCloseAddConnector: () => void;
  connectorType?: ConnectComponentType | ConnectComponentType[];
  onAddConnector: ((connectionName: string, connectionType: ConnectComponentType) => void) | undefined;
  components: ComponentList;
  title?: string;
  searchPlaceholder?: string;
}) => {
  let typeFilter: ConnectComponentType[] | undefined;
  if (Array.isArray(connectorType)) {
    typeFilter = connectorType;
  } else if (connectorType) {
    typeFilter = [connectorType];
  }

  return (
    <Dialog onOpenChange={onCloseAddConnector} open={isOpen}>
      <DialogContent height="lg" size="xl">
        <DialogHeader>
          <DialogTitle>{title ?? 'Add a connector'}</DialogTitle>
        </DialogHeader>
        <ConnectCommandPalette
          allowedTypes={typeFilter}
          components={components}
          onCancel={onCloseAddConnector}
          onSelect={(name, type) => onAddConnector?.(name, type)}
          searchPlaceholder={searchPlaceholder}
        />
      </DialogContent>
    </Dialog>
  );
};
