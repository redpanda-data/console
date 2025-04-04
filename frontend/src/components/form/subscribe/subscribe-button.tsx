import { Button, type ButtonProps } from '@redpanda-data/ui';
import type { ReactNode } from 'react';
import { useFormContext } from '../form-hook-contexts';

export interface SubscribeButtonProps extends Omit<ButtonProps, 'onClick' | 'isLoading' | 'isDisabled'> {
  label?: ReactNode;
  loadingText?: ReactNode;
}

export const SubscribeButton = ({
  label,
  variant = 'brand',
  loadingText = 'Creating',
  ...rest
}: SubscribeButtonProps) => {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <Button
          variant={variant}
          isLoading={isSubmitting}
          isDisabled={!canSubmit || isSubmitting}
          loadingText={loadingText}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          {...rest}
        >
          {label ?? 'Submit'}
        </Button>
      )}
    </form.Subscribe>
  );
};
