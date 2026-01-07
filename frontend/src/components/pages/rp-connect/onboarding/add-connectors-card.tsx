import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';

import { getConnectorTypeBadgeProps } from './connector-badges';
import type { ConnectComponentType } from '../types/schema';

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
    <Badge className="max-w-fit cursor-pointer" icon={icon} onClick={() => onClick(type)} variant={variant}>
      {text}
      <PlusIcon className={cn(className, 'mb-0.5 ml-3')} size={12} />
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
        <CardContent className="flex flex-col gap-4 space-y-0">
          <div className="flex flex-wrap gap-2">
            {allowedConnectorTypes.map((connectorType) => (
              <AddConnectorButton key={connectorType} onClick={onAddConnector} type={connectorType} />
            ))}
            {Boolean(inputSupportsScanner) && <AddConnectorButton onClick={onAddConnector} type="scanner" />}
          </div>
          {!(hasInput && hasOutput) && (
            <div className="flex flex-col gap-2">
              <Separator className="mb-2" />
              {!hasInput && <AddConnectorButton onClick={onAddConnector} type="input" />}
              {!hasOutput && <AddConnectorButton onClick={onAddConnector} type="output" />}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
