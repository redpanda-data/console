import { Button, type ButtonProps } from 'components/redpanda-ui/components/button';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Heading } from 'components/redpanda-ui/components/typography';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';

import { getConnectorTypeProps } from './connector-badges';
import type { ConnectComponentType } from '../types/schema';

const allowedConnectorTypes: ConnectComponentType[] = ['processor', 'cache', 'buffer'];

const SCANNER_SUPPORTED_INPUTS = ['aws_s3', 'gcp_cloud_storage', 'azure_blob_storage'];

const AddConnectorButton = ({
  type,
  onClick,
  variant = 'secondary-outline',
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
    const inputSupportsScanner = editorContent
      ? SCANNER_SUPPORTED_INPUTS.some((inputType) => {
          // Match input: <inputType>: pattern
          const regex = new RegExp(`input:\\s*\n\\s*${inputType}:`);
          return regex.test(editorContent);
        })
      : false;

    return (
      <div className="!border-border border-t p-4">
        <div className="flex flex-col gap-2">
          <Heading className="mb-2 text-muted-foreground" level={5}>
            Connectors
          </Heading>
          <div className="flex flex-wrap gap-2">
            {allowedConnectorTypes.map((connectorType) => (
              <AddConnectorButton key={connectorType} onClick={onAddConnector} type={connectorType} />
            ))}
            {Boolean(inputSupportsScanner) && <AddConnectorButton onClick={onAddConnector} type="scanner" />}
          </div>
          {hideInputOutput || !(hasInput && hasOutput) ? null : (
            <div className="flex flex-col gap-2">
              <Separator className="mb-2" />
              {!hasInput && <AddConnectorButton onClick={onAddConnector} type="input" variant="outline" />}
              {!hasOutput && <AddConnectorButton onClick={onAddConnector} type="output" variant="outline" />}
            </div>
          )}
        </div>
      </div>
    );
  }
);
