import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Link } from 'components/redpanda-ui/components/typography';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { ConnectTiles } from './connect-tiles';
import type { ConnectComponentType } from '../types/schema';

function getDocsUrl(connectorType?: ConnectComponentType | ConnectComponentType[]): string | null {
  const type = Array.isArray(connectorType) ? connectorType[0] : connectorType;
  if (!type) {
    return null;
  }
  return `https://docs.redpanda.com/redpanda-cloud/develop/connect/components/${type}s/about/`;
}

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

  const docsUrl = getDocsUrl(connectorType);

  return (
    <Dialog onOpenChange={onCloseAddConnector} open={isOpen}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{title ?? 'Add a connector'}</DialogTitle>
          <DialogDescription>
            Configure your pipeline.{' '}
            {docsUrl ? (
              <Link href={docsUrl} rel="noopener noreferrer" target="_blank">
                Learn more
              </Link>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ConnectTiles
            className="px-0 pt-0"
            components={components}
            componentTypeFilter={typeFilter}
            gridCols={3}
            hideHeader
            onChange={onAddConnector}
            searchPlaceholder={searchPlaceholder}
            variant="ghost"
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
