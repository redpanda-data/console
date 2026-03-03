import {
  Button,
  type ButtonProps,
  Flex,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  Tooltip,
  useBoolean,
} from '@redpanda-data/ui';
import { EyeIcon, EyeOffIcon } from 'components/icons';
import { useRef, useState } from 'react';

export type SecretInputProps = {
  value: string;
  onChange: (v: string) => void;
  updating: boolean;
};

const EditButton = ({ onClick }: Pick<ButtonProps, 'onClick'>) => (
  <Tooltip hasArrow={true} label="Edit secret value" placement="top">
    <Button onClick={onClick} variant="link">
      Edit
    </Button>
  </Tooltip>
);

const ClearButton = ({ onClick }: Pick<ButtonProps, 'onClick'>) => (
  <Button onClick={onClick} variant="link">
    Undo
  </Button>
);

export const SecretInput = ({ value, onChange, updating = false }: SecretInputProps) => {
  const [visible, setVisible] = useBoolean();
  const initialValueRef = useRef(value);
  const [canEdit, setCanEdit] = useState(!updating);
  const [localValue, setLocalValue] = useState(value);

  const editButton = (
    <EditButton
      onClick={() => {
        setCanEdit(true);
        setLocalValue('');
      }}
    />
  );

  const clearButton = (
    <ClearButton
      onClick={() => {
        setCanEdit(false);
        setLocalValue(initialValueRef.current);
        onChange(initialValueRef.current);
        setVisible.off();
      }}
    />
  );

  return (
    <Flex flexDirection="row" gap={2}>
      <InputGroup>
        <Input
          onChange={(e) => {
            setLocalValue(e.target.value);
            if (onChange) {
              onChange(e.target.value);
            }
          }}
          readOnly={!canEdit}
          type={visible ? 'text' : 'password'}
          value={localValue}
        />
        {Boolean(canEdit) && (
          <InputRightElement>
            <Button onClick={() => setVisible.toggle()} variant="ghost">
              <Icon as={visible ? EyeIcon : EyeOffIcon} color="gray.500" />
            </Button>
          </InputRightElement>
        )}
      </InputGroup>
      {Boolean(updating) && (canEdit ? clearButton : editButton)}
    </Flex>
  );
};

export default SecretInput;
