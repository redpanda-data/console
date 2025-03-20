import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  useBoolean,
} from '@redpanda-data/ui';
import { useFieldContext } from './form-hook-contexts';

export const PasswordField = ({
  label,
}: {
  label: string;
}) => {
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
        />
        <InputRightElement>
          <Button variant="ghost" onClick={setShowValue.toggle}>
            {showValue ? <ViewOffIcon /> : <ViewIcon />}
          </Button>
        </InputRightElement>
      </InputGroup>
      {field.state.meta.errors?.length > 0 && <FormErrorMessage>{field.state.meta.errors[0]}</FormErrorMessage>}
    </FormControl>
  );
};
