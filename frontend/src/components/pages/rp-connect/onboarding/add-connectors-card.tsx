import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PlusIcon } from 'lucide-react';
import type { ConnectComponentType } from '../types/rpcn-schema';
import { getComponentTypeBadgeProps } from '../utils/badges';

const processorTypes: ConnectComponentType[] = [
  'buffer',
  'cache',
  'processor',
  'rate_limit',
  'metrics',
  'tracer',
  'scanner',
];

const AddConnectorButton = ({
  type,
  onClick,
}: {
  type: ConnectComponentType;
  onClick: (type: ConnectComponentType) => void;
}) => {
  const { text, variant, className, icon } = getComponentTypeBadgeProps(type);
  return (
    <Badge icon={icon} variant={variant} className="cursor-pointer max-w-fit" onClick={() => onClick(type)}>
      {text}
      <PlusIcon size={12} className={cn(className, 'ml-3 mb-0.5')} />
    </Badge>
  );
};

export const AddConnectorsCard = ({
  onAddConnector,
  hasInput,
  hasOutput,
}: {
  onAddConnector: (type: ConnectComponentType) => void;
  hasInput: boolean;
  hasOutput: boolean;
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
            <AddConnectorButton key={processorType} type={processorType} onClick={onAddConnector} />
          ))}
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
};
