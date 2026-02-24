import { type ClassValue, clsx } from 'clsx';
import type React from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function wrapStringChild(
  child: React.ReactNode,
  Wrapper: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>,
  className?: string
): React.ReactNode {
  if (typeof child === 'string') {
    return <Wrapper className={className}>{child}</Wrapper>;
  }
  return child;
}

export type SharedProps = {
  testId?: string;
};

// =============================================================================
// Portal Component Common Types
// =============================================================================
// These types provide a single source of truth for portal component props
// that need to be exposed for visual regression testing.

/**
 * Common props for portal root components that support controlled open state.
 * Components: Dialog, Popover, Sheet, Drawer, etc.
 */
export type PortalRootProps = {
  /** Controlled open state */
  open?: boolean;
  /** Uncontrolled default open state */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
};

/**
 * Extended root props for modal components that need non-modal mode.
 * Components: Dialog, Sheet, Drawer, DropdownMenu
 */
export type ModalRootProps = PortalRootProps & {
  /** When false, prevents body pointer-events:none and focus trapping */
  modal?: boolean;
};

/**
 * Common props for portal content components that use FocusScope.
 * These props control auto-focus behavior when content opens/closes.
 */
export type FocusScopeContentProps = {
  /** Callback to prevent auto-focus when content opens (passed to Radix primitive) */
  onOpenAutoFocus?: (event: Event) => void;
  /** Callback to control focus when content closes */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Common props for portal content components.
 * Combines container prop with focus scope props.
 */
export type PortalContentProps = FocusScopeContentProps & {
  /** Container element for inline rendering (no portal to body) */
  container?: Element;
};

/**
 * Extended content props for fixed-position modal components.
 * Components: Dialog, Sheet, Drawer, Credenza, AlertDialog
 */
export type FixedPositionContentProps = PortalContentProps & {
  /** When false, hides the overlay/backdrop */
  showOverlay?: boolean;
};
