import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';
import type { ConnectComponentType } from '../types/schema';
import { getConnectorTypeBadgeProps } from './connector-badges';

const allowedConnectorTypes: ConnectComponentType[] = ['processor', 'cache', 'buffer'];

const SCANNER_SUPPORTED_INPUTS = ['aws_s3', 'gcp_cloud_storage', 'azure_blob_storage'];

const AddConnectorButton = ({
  type,
  onClick,
}: {
  type: ConnectComponentType;
  onClick: (type: ConnectComponentType) => void;
}) => {
  const { text, variant, className, icon } = getConnectorTypeBadgeProps(type);
  return (
    <Badge icon={icon} variant={variant} className="cursor-pointer max-w-fit" onClick={() => onClick(type)}>
      {text}
      <PlusIcon size={12} className={cn(className, 'ml-3 mb-0.5')} />
    </Badge>
  );
};

export const AddConnectorsCard = memo(
  ({
    onAddConnector,
    hasInput,
    hasOutput,
    editorContent,
  }: {
    onAddConnector: (type: ConnectComponentType) => void;
    hasInput?: boolean;
    hasOutput?: boolean;
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
      <Card>
        <CardHeader>
          <CardTitle>Connectors</CardTitle>
          <CardDescription>Add connectors to your pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="gap-4 flex flex-col space-y-0">
          <div className="flex-wrap flex gap-2">
            {allowedConnectorTypes.map((connectorType) => (
              <AddConnectorButton key={connectorType} type={connectorType} onClick={onAddConnector} />
            ))}
            {inputSupportsScanner && <AddConnectorButton type="scanner" onClick={onAddConnector} />}
          </div>
          {(!hasInput || !hasOutput) && (
            <div className="flex flex-col gap-2">
              <Separator className="mb-2" />
              {!hasInput && <AddConnectorButton type="input" onClick={onAddConnector} />}
              {!hasOutput && <AddConnectorButton type="output" onClick={onAddConnector} />}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);
