import type { BadgeVariant } from 'components/redpanda-ui/components/badge';
import { Cpu, Database, FolderInput, FolderOutput, HelpCircle, Layers, Search, Timer } from 'lucide-react';

import type { ConnectComponentType } from '../types/schema';

export type ConnectBadgeProps = {
  icon: React.ReactNode;
  text: string;
  variant: BadgeVariant;
  className: string;
};

export const getConnectorTypeBadgeProps = (type: ConnectComponentType): ConnectBadgeProps => {
  switch (type) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        variant: 'success-inverted' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        variant: 'warning-inverted' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        variant: 'info-inverted' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        variant: 'secondary-inverted' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        variant: 'secondary-inverted' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        variant: 'warning-inverted' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        variant: 'info-inverted' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        variant: 'info-inverted' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        variant: 'secondary-inverted' as const,
        className: 'text-rose-800 dark:text-rose-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Unknown',
        variant: 'neutral-inverted' as const,
        className: 'text-gray-800 dark:text-gray-300',
      };
  }
};
