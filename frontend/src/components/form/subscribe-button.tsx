import { Button } from '@redpanda-data/ui';
import { useFormContext } from './form-hook-contexts';

interface SubscribeButtonProps {
  label: string;
  variant?:
    | 'brand'
    | 'ghost'
    | 'link'
    | 'nav'
    | 'outline'
    | 'solid'
    | 'solid-brand'
    | 'outline-delete'
    | 'delete'
    | 'icon'
    | 'ghost-white'
    | 'subtle'
    | 'unstyled'
    | 'inputOutline';
}

export const SubscribeButton = ({ label, variant = 'brand' }: SubscribeButtonProps) => {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <Button
          variant={variant}
          isLoading={isSubmitting}
          isDisabled={!canSubmit || isSubmitting}
          loadingText="Creating"
          onClick={() => form.handleSubmit()}
        >
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
};
