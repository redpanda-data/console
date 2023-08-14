// import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { EyeIcon, EyeOffIcon } from '@heroicons/react/outline';
import { Icon, Button, Flex, Input, ButtonProps, Tooltip, useBoolean, InputGroup, InputRightElement } from '@redpanda-data/ui';
import { observer, useLocalObservable } from 'mobx-react';

export interface SecretInputProps {
    value: string;
    onChange: (v: string) => void;
    updating: boolean;
}

const EditButton = ({ onClick }: Pick<ButtonProps, 'onClick'>) => (
    <Tooltip label="Edit secret value" placement="top" hasArrow={true}>
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
                    value={localState.value}
                    onChange={(e) => {
                        localState.value = e.target.value;
                        if (onChange) onChange(e.target.value);
                    }}
                    type={visible ? 'text' : 'password'}
                    readOnly={!localState.canEdit}
                />
                {localState.canEdit && (
                    <InputRightElement>
                        <Button variant="ghost" onClick={() => setVisible.toggle()}>
                            <Icon color="gray.500" as={visible ? EyeIcon : EyeOffIcon} />
                        </Button>
                    </InputRightElement>
                )}
            </InputGroup>
            {updating && (localState.canEdit ? clearButton : editButton)}
        </Flex>
    );
});

export default SecretInput;
