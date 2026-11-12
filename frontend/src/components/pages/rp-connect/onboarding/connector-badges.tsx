import { Cpu, Database, FolderInput, FolderOutput, HelpCircle, Layers, Search, Timer } from 'lucide-react';

import type { ConnectComponentType } from '../types/schema';

export type ConnectorProps = {
  icon: React.ReactNode;
  text: string;
};

export const getConnectorTypeProps = (type: ConnectComponentType): ConnectorProps => {
  switch (type) {
    case 'input':
      return {
        icon: <FolderInput className="size-3" />,
        text: 'Input',
      };
    case 'output':
      return {
        icon: <FolderOutput className="size-3" />,
        text: 'Output',
      };
    case 'processor':
      return {
        icon: <Cpu className="size-3" />,
        text: 'Processor',
      };
    case 'cache':
      return {
        icon: <Database className="size-3" />,
        text: 'Cache',
      };
    case 'buffer':
      return {
        icon: <Layers className="size-3" />,
        text: 'Buffer',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="size-3" />,
        text: 'Rate Limit',
      };
    case 'scanner':
      return {
        icon: <Search className="size-3" />,
        text: 'Scanner',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="size-3" />,
        text: 'Metrics',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="size-3" />,
        text: 'Tracer',
      };
    case 'custom':
    default:
      return {
        icon: <HelpCircle className="size-3" />,
        text: 'Unknown',
      };
  }
};
