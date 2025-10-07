import type { BadgeVariant } from 'components/redpanda-ui/components/badge';
import {
  Activity,
  ArrowRightLeft,
  Brain,
  Cloud,
  Cpu,
  Database,
  Download,
  FileText,
  FolderInput,
  FolderOutput,
  GitBranch,
  Globe,
  HardDrive,
  Hash,
  HelpCircle,
  Home,
  Layers,
  MessageCircle,
  Monitor,
  Network,
  RefreshCw,
  Search,
  Shield,
  Timer,
  Users,
  Wrench,
} from 'lucide-react';

import type { ComponentCategory, ConnectComponentType } from '../types/schema';
import { getCategoryDisplayName } from '../utils/categories';

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
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        variant: 'cyan' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'metrics':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Metrics',
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'tracer':
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Tracer',
        variant: 'rose' as const,
        className: 'text-rose-800 dark:text-rose-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Unknown',
        variant: 'gray' as const,
        className: 'text-gray-800 dark:text-gray-300',
      };
  }
};

export const getCategoryBadgeProps = (
  category: ComponentCategory | ConnectComponentType | string
): ConnectBadgeProps => {
  // Handle null/undefined categories
  if (!category) {
    return {
      icon: <HelpCircle className="h-3 w-3" />,
      text: 'Unknown',
      variant: 'gray' as const,
      className: 'text-gray-800 dark:text-gray-300',
    };
  }

  const categoryLower = category.toLowerCase();
  const displayText = getCategoryDisplayName(categoryLower);

  switch (categoryLower) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: displayText,
        variant: 'cyan' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'metrics':
      return {
        icon: <Activity className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'tracer':
      return {
        icon: <RefreshCw className="h-3 w-3" />,
        text: displayText,
        variant: 'rose' as const,
        className: 'text-rose-800 dark:text-rose-300',
      };
    // Semantic categories
    case 'databases':
      return {
        icon: <Database className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'messaging':
      return {
        icon: <MessageCircle className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'storage':
      return {
        icon: <HardDrive className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'api':
      return {
        icon: <Globe className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'aws':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    case 'gcp':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'azure':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'cyan' as const,
        className: 'text-cyan-800 dark:text-cyan-300',
      };
    case 'cloud':
      return {
        icon: <Cloud className="h-3 w-3" />,
        text: displayText,
        variant: 'gray' as const,
        className: 'text-gray-800 dark:text-gray-300',
      };
    case 'export':
      return {
        icon: <Download className="h-3 w-3" />,
        text: displayText,
        variant: 'emerald' as const,
        className: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'transformation':
      return {
        icon: <RefreshCw className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'monitoring':
      return {
        icon: <Activity className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'windowing':
      return {
        icon: <Monitor className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'utility':
      return {
        icon: <Wrench className="h-3 w-3" />,
        text: displayText,
        variant: 'amber' as const,
        className: 'text-amber-800 dark:text-amber-300',
      };
    case 'local':
      return {
        icon: <Home className="h-3 w-3" />,
        text: displayText,
        variant: 'green' as const,
        className: 'text-green-800 dark:text-green-300',
      };
    case 'social':
      return {
        icon: <Users className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'network':
      return {
        icon: <Network className="h-3 w-3" />,
        text: displayText,
        variant: 'indigo' as const,
        className: 'text-indigo-800 dark:text-indigo-300',
      };
    case 'integration':
      return {
        icon: <GitBranch className="h-3 w-3" />,
        text: displayText,
        variant: 'emerald' as const,
        className: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'spicedb':
      return {
        icon: <Shield className="h-3 w-3" />,
        text: displayText,
        variant: 'red' as const,
        className: 'text-red-800 dark:text-red-300',
      };
    case 'ai':
      return {
        icon: <Brain className="h-3 w-3" />,
        text: displayText,
        variant: 'purple' as const,
        className: 'text-purple-800 dark:text-purple-300',
      };
    case 'parsing':
      return {
        icon: <FileText className="h-3 w-3" />,
        text: displayText,
        variant: 'blue' as const,
        className: 'text-blue-800 dark:text-blue-300',
      };
    case 'mapping':
      return {
        icon: <ArrowRightLeft className="h-3 w-3" />,
        text: displayText,
        variant: 'yellow' as const,
        className: 'text-yellow-800 dark:text-yellow-300',
      };
    case 'composition':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: displayText,
        variant: 'teal' as const,
        className: 'text-teal-800 dark:text-teal-300',
      };
    case 'unstructured':
      return {
        icon: <Hash className="h-3 w-3" />,
        text: displayText,
        variant: 'orange' as const,
        className: 'text-orange-800 dark:text-orange-300',
      };
    default:
      // Log unknown categories for debugging
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      }
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: displayText,
        variant: 'gray' as const,
        className: 'text-gray-800 dark:text-gray-300',
      };
  }
};
