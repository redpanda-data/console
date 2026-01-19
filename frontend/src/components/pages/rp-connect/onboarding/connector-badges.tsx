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
        variant: 'success-inverted',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        variant: 'info-inverted',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        variant: 'primary-inverted',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        variant: 'secondary-inverted',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        variant: 'secondary-inverted',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        variant: 'warning-inverted',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        variant: 'info-inverted',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        variant: 'secondary-inverted',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        variant: 'secondary-inverted',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Unknown',
        variant: 'neutral-inverted',
      };
  }
};
