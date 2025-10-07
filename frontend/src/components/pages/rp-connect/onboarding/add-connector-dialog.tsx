import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import type { ConnectComponentType } from '../types/schema';
import { ConnectTiles } from './connect-tiles';

export const AddConnectorDialog = ({
  isOpen,
  onCloseAddConnector,
  connectorType,
  onAddConnector,
}: {
  isOpen: boolean;
  onCloseAddConnector: () => void;
  connectorType?: ConnectComponentType;
  onAddConnector: ((connectionName: string, connectionType: ConnectComponentType) => void) | undefined;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onCloseAddConnector}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Add a Connector</DialogTitle>
          <DialogDescription>Add a connector to your pipeline.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ConnectTiles
            componentTypeFilter={connectorType ? [connectorType] : undefined}
            hideHeader
            hideFilters
            onChange={onAddConnector}
            variant="ghost"
            className="px-0 pt-0"
            gridCols={3}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
