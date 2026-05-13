import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import React from 'react';

import { renderWithDataState } from '../lib/base-ui-compat';
import { cn, type SharedProps } from '../lib/utils';

type SwitchProps = Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, 'onCheckedChange'> &
  SharedProps & {
    onCheckedChange?: (checked: boolean) => void;
  };

function Switch(allProps: SwitchProps) {
  const { className, testId, onCheckedChange, ...props } = allProps;

  const handleCheckedChange = React.useMemo(() => {
    if (!onCheckedChange) {
      return;
    }
    return (next: boolean) => onCheckedChange(next);
  }, [onCheckedChange]);

  // Radix parity: when consumers explicitly pass `checked` (controlled mode) but
  // their source-of-truth starts as `undefined` (e.g. react-hook-form
  // `field.value`), Base UI's `useControlled` warns on the undefined → boolean
  // transition. Radix tolerated this silently. Normalize undefined → false only
  // when `checked` was explicitly passed — uncontrolled mode via `defaultChecked`
  // (without `checked`) keeps working unchanged.
  const hasCheckedProp = 'checked' in allProps;
  const checkedOverride = hasCheckedProp && allProps.checked === undefined ? { checked: false } : undefined;

  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs outline-none transition-all hover:not-disabled:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-selected data-[state=unchecked]:bg-input',
        className
      )}
      data-slot="switch"
      data-testid={testId}
      nativeButton
      onCheckedChange={handleCheckedChange}
      render={renderWithDataState('button')}
      {...props}
      {...checkedOverride}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-selected-foreground'
        )}
        data-slot="switch-thumb"
        render={renderWithDataState('span')}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
