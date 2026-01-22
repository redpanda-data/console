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
// Social media icons - lucide-react (LinkedIn removed from simple-icons due to trademark)
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
  Linkedin as LinkedInIcon, // FaLinkedin (LinkedIn removed from simple-icons)
  Loader2 as LoaderIcon, // Loading spinner
  Lock as LockIcon, // LockIcon (Octicons)
  Menu as MenuIcon, // ThreeBarsIcon (Octicons)
  Minus as MinusIcon, // MinusIcon (Chakra)
  MoreHorizontal as MoreHorizontalIcon, // BsThreeDots, KebabHorizontalIcon (Octicons)
  Pause as PauseIcon, // MdPause
  PauseCircle as PauseCircleIcon, // MdOutlinePauseCircle
  Pencil as EditIcon, // PencilIcon (Heroicons)
  PlayCircle as PlayIcon, // MdPlayCircleOutline
  Plus as PlusIcon, // AiOutlinePlus, PlusIcon (Octicons)
  RefreshCw as RefreshIcon, // MdOutlineCached, SyncIcon (Octicons)
  Reply as ReplyIcon, // MdOutlineQuickreply
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
