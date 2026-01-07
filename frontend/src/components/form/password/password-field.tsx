import {
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Icon,
  Input,
  InputGroup,
  type InputProps,
  InputRightElement,
  Stack,
  useBoolean,
} from '@redpanda-data/ui';
import { EyeIcon, EyeOffIcon } from 'components/icons';
import type { ReactNode } from 'react';

import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

export interface PasswordFieldProps extends InputProps {
  label?: ReactNode;
  helperText?: ReactNode;
}

export const PasswordField = ({ label, helperText, ...rest }: PasswordFieldProps) => {
  const field = useFieldContext<string>();
  const [showValue, setShowValue] = useBoolean(false);

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <Stack spacing={0.5}>
        {Boolean(label) && (
          <FormLabel fontWeight="medium" mb={0}>
            {label}
          </FormLabel>
        )}
        {Boolean(helperText) && (
          <FormHelperText mb={1} mt={0}>
            {helperText}
          </FormHelperText>
        )}
      </Stack>
      <InputGroup>
        <Input
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          type={showValue ? 'text' : 'password'}
          value={field.state.value}
          {...rest}
        />
        <InputRightElement>
          <Button onClick={setShowValue.toggle} variant="ghost">
            {showValue ? <Icon as={EyeOffIcon} /> : <Icon as={EyeIcon} />}
          </Button>
        </InputRightElement>
      </InputGroup>
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
