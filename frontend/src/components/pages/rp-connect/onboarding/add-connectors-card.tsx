import { Button, type ButtonProps } from 'components/redpanda-ui/components/button';
import { Separator } from 'components/redpanda-ui/components/separator';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';

import { getConnectorTypeProps } from './connector-badges';
import type { ConnectComponentType } from '../types/schema';

const allowedConnectorTypes: ConnectComponentType[] = ['processor', 'cache', 'buffer'];

const SCANNER_SUPPORTED_INPUTS = ['aws_s3', 'gcp_cloud_storage', 'azure_blob_storage'];

const AddConnectorButton = ({
  type,
  onClick,
  variant = 'outline',
}: {
  type: ConnectComponentType;
  onClick: (type: ConnectComponentType) => void;
  variant?: ButtonProps['variant'];
}) => {
  const { text, icon } = getConnectorTypeProps(type);
  return (
    <Button className="max-w-fit" icon={<PlusIcon />} onClick={() => onClick(type)} size="xs" variant={variant}>
      {icon}
      {text}
    </Button>
  );
};

export const AddConnectorsCard = memo(
  ({
    onAddConnector,
    hasInput,
    hasOutput,
    hideInputOutput,
    editorContent,
  }: {
    onAddConnector: (type: ConnectComponentType) => void;
    hasInput?: boolean;
    hasOutput?: boolean;
    /** Hide input/output buttons (e.g. when the diagram provides add-connector buttons instead). */
    hideInputOutput?: boolean;
    editorContent?: string;
  }) => {
    const inputSupportsScanner =
      editorContent !== null && editorContent !== undefined && editorContent !== ''
        ? SCANNER_SUPPORTED_INPUTS.some((inputType) => {
            // Match input: <inputType>: pattern
            const regex = new RegExp(`input:\\s*\n\\s*${inputType}:`);
            return regex.test(editorContent);
          })
        : false;

    return (
      <div className="border-t !border-border p-4">
        <div className="flex flex-col gap-2">
          <h5 className="mb-2 text-heading-xs text-muted-foreground">Connectors</h5>
          <div className="flex flex-wrap gap-2">
            {allowedConnectorTypes.map((connectorType) => (
              <AddConnectorButton key={connectorType} onClick={onAddConnector} type={connectorType} />
            ))}
            {inputSupportsScanner && <AddConnectorButton onClick={onAddConnector} type="scanner" />}
          </div>
          {hideInputOutput === true || (hasInput === true && hasOutput === true) ? null : (
            <div className="flex flex-col gap-2">
              <Separator className="mb-2" />
              {!(hasInput === true) && <AddConnectorButton onClick={onAddConnector} type="input" variant="outline" />}
              {!(hasOutput === true) && <AddConnectorButton onClick={onAddConnector} type="output" variant="outline" />}
            </div>
          )}
        </div>
      </div>
    );
  }
);
