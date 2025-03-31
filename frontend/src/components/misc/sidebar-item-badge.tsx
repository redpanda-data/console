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
    variant="outline"
    style={{
      display: 'inline-block',
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
      WebkitPaddingStart: 'var(--chakra-space-1)',
      paddingInlineStart: 'var(--chakra-space-1)',
      WebkitPaddingEnd: 'var(--chakra-space-1)',
      paddingInlineEnd: 'var(--chakra-space-1)',
      textTransform: 'uppercase',
      fontSize: '10px',
      borderRadius: 'var(--chakra-radii-sm)',
      fontWeight: 'var(--chakra-fontWeights-bold)',
      background: 'var(--chakra-colors-transparent)',
      color: 'var(--chakra-colors-gray-100)',
      boxShadow: 'var(--chakra-shadows-none)',
      borderWidth: '1px',
      borderColor: 'var(--chakra-colors-gray-200)',
    }}
  >
    {children}
  </Badge>
);
