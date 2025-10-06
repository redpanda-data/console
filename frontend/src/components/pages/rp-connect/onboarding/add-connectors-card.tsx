import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PlusIcon } from 'lucide-react';
import { memo } from 'react';

import { getConnectorTypeBadgeProps } from './connector-badges';
import { CONNECT_COMPONENT_TYPE, type ConnectComponentType } from '../types/schema';

// Derive processor types from CONNECT_COMPONENT_TYPE (all types except input/output)
const processorTypes = CONNECT_COMPONENT_TYPE.filter((t) => t !== 'input' && t !== 'output');

const AddConnectorButton = ({
  type,
  onClick,
}: {
  type: ConnectComponentType;
  onClick: (type: ConnectComponentType) => void;
}) => {
  const { text, variant, className, icon } = getConnectorTypeBadgeProps(type);
  return (
    <Badge className="cursor-pointer max-w-fit" icon={icon} onClick={() => onClick(type)} variant={variant}>
      {text}
      <PlusIcon className={cn(className, 'ml-3 mb-0.5')} size={12} />
    </Badge>
  );
};

export const AddConnectorsCard = memo(
  ({
    onAddConnector,
    hasInput,
    hasOutput,
  }: {
    onAddConnector: (type: ConnectComponentType) => void;
    hasInput?: boolean;
    hasOutput?: boolean;
  }) => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connectors</CardTitle>
          <CardDescription>Add connectors to your pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="gap-4 flex flex-col space-y-0">
          <div className="flex-wrap flex gap-2">
            {processorTypes.map((processorType) => (
              <AddConnectorButton key={processorType} onClick={onAddConnector} type={processorType} />
            ))}
          </div>
          {(!hasInput || !hasOutput) && (
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
