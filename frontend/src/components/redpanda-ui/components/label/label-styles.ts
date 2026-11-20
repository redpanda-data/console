import { cn } from '../../lib/utils';

export interface LabelAppearance {
  /** Align text with the inset of an adjacent field control. */
  inset?: boolean | undefined;
  /** Show validation feedback without changing native label semantics. */
  invalid?: boolean | undefined;
  /** Smaller field text or a larger group label, using the shared type scale. */
  size?: 'sm' | 'default' | 'lg' | undefined;
  /** Closed treatments for labels that are the full hit area of a choice control. */
  surface?: 'default' | 'card' | 'pill' | 'attached' | 'tile' | 'compact-card' | undefined;
  /** Normal option text, medium default text, or strong nested-field labels. */
  variant?: 'default' | 'option' | 'strong' | undefined;
}

const choiceSurfaces = {
  default: '',
  card: 'gap-3 rounded-md border border-input p-4 transition-colors hover:bg-accent has-data-[checked]:border-selected has-data-[checked]:bg-accent motion-reduce:transition-none',
  pill: 'gap-3 rounded-full border border-input text-center shadow-xs transition-[color,box-shadow] has-data-[checked]:border-selected has-data-[checked]:bg-selected has-data-[checked]:text-selected-foreground motion-reduce:transition-none',
  attached:
    'gap-4 border border-input p-4 first:rounded-t-md last:rounded-b-md has-data-[checked]:z-10 has-data-[checked]:border-selected/50 has-data-[checked]:bg-accent',
  tile: 'rounded-lg border-2 border-surface-subtle bg-popover p-4 peer-data-[checked]:border-primary peer-data-[checked]:bg-primary-wash hover:not-peer-data-disabled:bg-accent hover:not-peer-data-disabled:text-accent-foreground peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-75',
  'compact-card':
    'rounded-md border px-1 py-1 text-body transition-colors hover:bg-accent has-data-[checked]:border-primary has-data-[checked]:bg-primary-wash motion-reduce:transition-none',
};

/** Shared label typography and states; each native label owns its composition. */
export function labelStyles({
  inset = false,
  invalid = false,
  size = 'default',
  surface = 'default',
  variant = 'default',
}: LabelAppearance) {
  return cn(
    'flex items-center gap-2 text-label select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
    choiceSurfaces[surface],
    surface !== 'default' &&
      'cursor-pointer outline-none peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50',
    size === 'sm' && 'text-body-sm',
    size === 'lg' && 'text-body-lg',
    variant === 'option' && 'font-normal',
    variant === 'strong' && 'font-semibold',
    invalid && 'text-destructive',
    inset && 'px-1'
  );
}
