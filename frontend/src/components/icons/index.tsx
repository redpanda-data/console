/**
 * Central Icon System for Redpanda Console
 *
 * This file provides a unified icon export system using lucide-react and @icons-pack/react-simple-icons.
 * All icons are re-exported with consistent naming and typing.
 *
 * Migration Notes:
 * - Replaces react-icons (38 files, 6 sub-packages)
 * - Replaces @chakra-ui/icons (10 files)
 * - Replaces @heroicons/react (11 files)
 * - Replaces @primer/octicons-react (16 files)
 *
 * Usage:
 *   import { CheckIcon, TrashIcon, GitHubIcon } from 'components/icons';
 */

// Social media icons - simple-icons
// biome-ignore lint/performance/noBarrelFile: Intentional central icon system as per project architecture
export {
  SiGithub as GitHubIcon, // FaGithub
  SiSlack as SlackIcon, // FaSlack
  SiX as TwitterIcon, // FaTwitter (Twitter rebranded to X)
} from '@icons-pack/react-simple-icons';

// LinkedIn removed from both lucide-react (v1.x) and @icons-pack/react-simple-icons
// (trademark). Inline SVG preserves the brand mark while staying dependency-free.
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
// Core action icons
// Navigation icons
// State icons
// Chevron/directional icons
// Action/utility icons
export {
  Activity as ActivityIcon, // Activity (for Transcripts)
  AlertCircle as AlertIcon, // MdOutlineError, MdOutlineErrorOutline, AiOutlineExclamationCircle, AlertIcon (Octicons)
  AlertTriangle as WarningIcon, // MdOutlineWarning, MdOutlineWarningAmber, WarningIcon (Chakra)
  Archive as ArchiveIcon, // ArchiveIcon (Heroicons)
  ArrowBigUp as ArrowBigUpIcon,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as TabIcon, // MdKeyboardTab (no direct Tab icon in lucide)
  Ban as BanIcon, // MdDoNotDisturb, CircleSlashIcon (Octicons)
  Beaker as BeakerIcon, // BeakerIcon (Heroicons)
  BookOpen as BookOpenIcon, // BookOpenIcon (Heroicons)
  Bot as AIIcon, // MdOutlineSmartToy
  Box as CubeIcon, // CubeTransparentIcon (Heroicons)
  Calendar as CalendarIcon, // MdCalendarToday
  Check as CheckIcon, // MdCheck, CheckIcon (Chakra/Octicons)
  CheckCircle as CheckCircleIcon, // MdCheckCircle
  ChevronDown as ChevronDownIcon, // ChevronDownIcon (Chakra)
  ChevronLeft as ChevronLeftIcon, // ChevronLeftIcon (Octicons)
  ChevronRight as ChevronRightIcon, // ChevronRightIcon (Heroicons/Octicons)
  ChevronUp as ChevronUpIcon, // ChevronUpIcon (Chakra)
  Code as CodeIcon, // MdJavascript
  Command as CommandIcon,
  Copy as CopyIcon, // MdContentCopy
  CopyPlus as CopyAllIcon, // MdOutlineCopyAll
  Crown as CrownIcon, // FaCrown
  Download as DownloadIcon, // MdOutlineDownload, DownloadIcon (Octicons)
  Eye as EyeIcon, // IoMdEye, EyeIcon (Heroicons)
  EyeOff as EyeOffIcon, // IoMdEyeOff, MdOutlineVisibilityOff, EyeOffIcon (Heroicons), EyeClosedIcon (Octicons)
  Filter as FilterIcon, // FilterIcon (Heroicons)
  Fingerprint as FingerprintIcon, // Fingerprint icon for context IDs
  Flame as FlameIcon, // MdLocalFireDepartment
  HelpCircle as HelpIcon, // MdHelpOutline, MdOutlineQuestionMark
  Home as HomeIcon, // HomeIcon (Heroicons)
  Hourglass as HourglassIcon, // MdHourglassFull
  Info as InfoIcon, // MdInfoOutline, InfoIcon (Chakra/Octicons)
  Key as KeyIcon, // MdKey
  Layers as LayersIcon, // MdOutlineLayers
  LayoutGrid as CollectionIcon, // CollectionIcon (Heroicons) - Note: 3x3 grid → 2x2 grid
  Link as LinkIcon, // LinkIcon (Heroicons)
  Loader2 as LoaderIcon, // Loading spinner
  Lock as LockIcon, // LockIcon (Octicons)
  Menu as MenuIcon, // ThreeBarsIcon (Octicons)
  Minus as MinusIcon, // MinusIcon (Chakra)
  MoreHorizontal as MoreHorizontalIcon, // BsThreeDots, KebabHorizontalIcon (Octicons)
  Pause as PauseIcon, // MdPause
  PauseCircle as PauseCircleIcon, // MdOutlinePauseCircle
  Pencil as EditIcon, // PencilIcon (Heroicons)
  Play as PlayTriangleIcon,
  PlayCircle as PlayIcon, // MdPlayCircleOutline
  Plus as PlusIcon, // AiOutlinePlus, PlusIcon (Octicons)
  RefreshCw as RefreshIcon, // MdOutlineCached, SyncIcon (Octicons)
  Reply as ReplyIcon, // MdOutlineQuickreply
  RotateCcw as RotateCcwIcon,
  RotateCw as RotateCwIcon, // MdRefresh
  Scale as ScaleIcon, // ScaleIcon (Heroicons)
  Settings as SettingsIcon, // MdOutlineSettings, GearIcon (Octicons)
  Shield as ShieldIcon, // Shield (for Shadow Links)
  ShieldCheck as ShieldCheckIcon, // ShieldCheckIcon (Heroicons)
  SkipBack as SkipBackIcon, // MdOutlineSkipPrevious
  SkipForward as SkipIcon, // SkipIcon (Octicons)
  StopCircle as StopCircleIcon, // FaRegStopCircle
  Timer as TimerIcon, // MdOutlineTimer
  Trash2 as TrashIcon, // MdDeleteOutline, DeleteIcon (Chakra), TrashIcon (Heroicons/Octicons), AiOutlineDelete, HiOutlineTrash
  UserCircle as UserCircleIcon, // UserCircleIcon (Heroicons), MdOutlinePermIdentity
  Wrench as WrenchIcon, // FaWrench
  X as CloseIcon, // MdClose, CloseIcon (Chakra), XIcon (Heroicons/Octicons)
  XCircle as ErrorIcon, // MdError, XCircleIcon (Heroicons/Octicons)
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
