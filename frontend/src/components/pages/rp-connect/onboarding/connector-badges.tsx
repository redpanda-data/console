import type { BadgeVariant } from 'components/redpanda-ui/components/badge';
import { Cpu, Database, FolderInput, FolderOutput, HelpCircle, Layers, Search, Timer } from 'lucide-react';

import type { ConnectComponentType } from '../types/schema';

export type ConnectBadgeProps = {
  icon: React.ReactNode;
  text: string;
  variant: BadgeVariant;
};

export const getConnectorTypeBadgeProps = (type: ConnectComponentType): ConnectBadgeProps => {
  switch (type) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        variant: 'neutral-inverted',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        variant: 'neutral-inverted',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        variant: 'neutral-inverted',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        variant: 'neutral-inverted',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        variant: 'neutral-inverted',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        variant: 'neutral-inverted',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        variant: 'neutral-inverted',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        variant: 'neutral-inverted',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        variant: 'neutral-inverted',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Unknown',
        variant: 'neutral-inverted',
      };
  }
};
