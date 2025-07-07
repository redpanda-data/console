import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/redpanda-ui/form';
import type { FieldSpec } from '@/components/node-editor/redpanda-connect/types';

type FormFieldWrapperProps = {
  spec: FieldSpec;
  children: React.ReactNode;
};

export const FormFieldWrapper: React.FC<FormFieldWrapperProps> = ({ spec, children }) => {
  return (
    <FormItem className="space-y-2 my-4">
      <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
      {spec.description && (
        <FormDescription className="text-xs text-muted-foreground leading-relaxed">
          {/* TODO: parse ascii doc */}
          {spec.description}
        </FormDescription>
      )}
      <FormControl>{children}</FormControl>
      <FormMessage />
    </FormItem>
  );
};
