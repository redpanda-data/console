import { EyeIcon, EyeOffIcon } from '@heroicons/react/outline';
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
import { observer, useLocalObservable } from 'mobx-react';

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

export const SecretInput = observer(({ value, onChange, updating = false }: SecretInputProps) => {
  const [visible, setVisible] = useBoolean();
  const localState = useLocalObservable(() => ({
    canEdit: !updating,
    initialValue: value,
    value: value,
    clear() {
      this.value = '';
    },
    reset() {
      this.value = this.initialValue;
    },
  }));

  const editButton = (
    <EditButton
      onClick={() => {
        localState.canEdit = !localState.canEdit;
        localState.clear();
      }}
    />
  );

  const clearButton = (
    <ClearButton
      onClick={() => {
        localState.canEdit = !localState.canEdit;
        localState.reset();
        onChange(localState.initialValue);
        setVisible.off();
      }}
    />
  );

  return (
    <Flex flexDirection="row" gap={2}>
      <InputGroup>
        <Input
          onChange={(e) => {
            localState.value = e.target.value;
            if (onChange) onChange(e.target.value);
          }}
          readOnly={!localState.canEdit}
          type={visible ? 'text' : 'password'}
          value={localState.value}
        />
        {localState.canEdit && (
          <InputRightElement>
            <Button onClick={() => setVisible.toggle()} variant="ghost">
              <Icon as={visible ? EyeIcon : EyeOffIcon} color="gray.500" />
            </Button>
          </InputRightElement>
        )}
      </InputGroup>
      {updating && (localState.canEdit ? clearButton : editButton)}
    </Flex>
  );
});

export default SecretInput;
