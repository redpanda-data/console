import { Badge } from '@redpanda-data/ui';

export interface SidebarItemBadgeProps {
  children: React.ReactNode;
}

/**
 * @description SidebarItemBadge should be used for sidebar items only.
 * It is a hack to make sidebar items customizable.
 * Chakra is ignored, so we need to style it manually
 * TODO: Remove once sidebar items can provide badge or we move to a new design system
 */
export const SidebarItemBadge = ({ children }: SidebarItemBadgeProps) => (
  <Badge
    variant="inverted"
    style={{
      display: 'inline-block',
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
      WebkitPaddingStart: 'var(--chakra-space-1)',
      WebkitPaddingEnd: 'var(--chakra-space-1)',
      paddingInlineStart: 'var(--chakra-space-1)',
      paddingInlineEnd: 'var(--chakra-space-1)',
      textTransform: 'inherit',
      fontSize: '12px',
      borderRadius: 'var(--chakra-radii-sm)',
      fontWeight: 'var(--chakra-fontWeights-medium)',
      background: 'var(--chakra-colors-gray-500)',
      boxShadow: 'var(--chakra-shadows-none)',
      borderColor: 'var(--chakra-colors-gray-200)',
      color: 'var(--chakra-colors-gray-100)',
    }}
  >
    {children}
  </Badge>
);
