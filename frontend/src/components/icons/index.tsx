// biome-ignore lint/performance/noBarrelFile: Intentional central icon system as per project architecture
export { default as GitHubIcon } from '@icons-pack/react-simple-icons/icons/SiGithub.mjs';
export { default as TwitterIcon } from '@icons-pack/react-simple-icons/icons/SiX.mjs';

export { OpenAIIcon, SalesforceIcon, SlackIcon } from './brand-icons';

/** LinkedIn mark, inlined because the shared icon libraries do not provide it. */
export const LinkedInIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="currentColor"
    focusable="false"
    height={size}
    role="img"
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>LinkedIn</title>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
export {
  Activity as ActivityIcon,
  AlertCircle as AlertIcon,
  AlertTriangle as WarningIcon,
  Archive as ArchiveIcon,
  ArrowBigUp as ArrowBigUpIcon,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as TabIcon,
  Ban as BanIcon,
  Beaker as BeakerIcon,
  BookOpen as BookOpenIcon,
  Bot as AIIcon,
  Box as CubeIcon,
  Calendar as CalendarIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ChevronUpIcon,
  Code as CodeIcon,
  Command as CommandIcon,
  Copy as CopyIcon,
  CopyPlus as CopyAllIcon,
  Crown as CrownIcon,
  Download as DownloadIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  Filter as FilterIcon,
  Fingerprint as FingerprintIcon,
  Flame as FlameIcon,
  HelpCircle as HelpIcon,
  Home as HomeIcon,
  Hourglass as HourglassIcon,
  Inbox as InboxIcon,
  Info as InfoIcon,
  Key as KeyIcon,
  Layers as LayersIcon,
  LayoutGrid as CollectionIcon,
  Link as LinkIcon,
  Loader2 as LoaderIcon,
  Lock as LockIcon,
  Menu as MenuIcon,
  Minus as MinusIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Pause as PauseIcon,
  PauseCircle as PauseCircleIcon,
  Pencil as EditIcon,
  Play as PlayTriangleIcon,
  PlayCircle as PlayIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshIcon,
  Reply as ReplyIcon,
  RotateCcw as RotateCcwIcon,
  RotateCw as RotateCwIcon,
  Scale as ScaleIcon,
  Settings as SettingsIcon,
  Shield as ShieldIcon,
  ShieldCheck as ShieldCheckIcon,
  SkipBack as SkipBackIcon,
  SkipForward as SkipIcon,
  StopCircle as StopCircleIcon,
  Timer as TimerIcon,
  Trash2 as TrashIcon,
  Wrench as WrenchIcon,
  X as CloseIcon,
  XCircle as ErrorIcon,
} from 'lucide-react';

/**
 * Default icon props for consistent styling
 */
export const defaultIconProps = {
  size: 16,
  strokeWidth: 2,
} as const;

/**
 * Icon size variants
 */
export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof iconSizes;

/**
 * Helper function to get icon size
 */
export function getIconSize(size: IconSize = 'sm'): number {
  return iconSizes[size];
}
