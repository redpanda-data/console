import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  type InputProps,
  InputRightElement,
  useBoolean,
} from '@redpanda-data/ui';
import { ErrorInfoField } from './error-info-field';
import { useFieldContext } from './form-hook-contexts';

interface PasswordFieldProps extends InputProps {
  label: string;
}

export const PasswordField = ({ label, ...rest }: PasswordFieldProps) => {
  const field = useFieldContext<string>();
  const [showValue, setShowValue] = useBoolean(false);

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      <InputGroup>
        <Input
          type={showValue ? 'text' : 'password'}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
          {...rest}
        />
        <InputRightElement>
          <Button variant="ghost" onClick={setShowValue.toggle}>
            {showValue ? <ViewOffIcon /> : <ViewIcon />}
          </Button>
        </InputRightElement>
      </InputGroup>
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
