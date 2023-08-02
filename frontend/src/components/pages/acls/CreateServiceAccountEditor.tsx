import { ReloadOutlined } from '@ant-design/icons';
import { Select } from 'antd';
import { Button, Input, Flex } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { CreateUserRequest } from '../../../state/restInterfaces';
import { Label, LabelTooltip } from '../../../utils/tsxUtils';
import { Tooltip } from '@redpanda-data/ui';

export const CreateServiceAccountEditor = observer((p: { state: CreateUserRequest }) => {
    const state = p.state;
    const [showPw, setShowPw] = useState(false);
    const toggleShowPw = () => setShowPw(!showPw);

    return (
        <div>
            <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
                <Label
                    text="Username"
                    textSuffix={
                        <LabelTooltip nowrap left maxW={500}>
                            The username of the service account to be created.
                            <br />
                            Must not be empty, must not contain any whitespace (space, tab, ...)
                        </LabelTooltip>
                    }
                >
                    <Input
                        value={state.username}
                        onChange={v => {
                            const newName = v.target.value;
                            if (newName.includes(':')) return;
                            state.username = newName;
                        }}
                        width="100%"
                        autoFocus
                        spellCheck={false}
                        placeholder="Username"
                        autoComplete="off"
                    />
                </Label>

                <Label
                    text="Password"
                    textSuffix={
                        <LabelTooltip nowrap left maxW={500}>
                            The password for the service account.
                            <br />
                            You can either use the randomly generated password or specify a custom one.
                            <br />
                            The password should not exceed 64 characters.
                        </LabelTooltip>
                    }
                >
                    <Flex alignItems="center" gap="2">
                        <Input type={showPw ? 'text' : 'password'} value={state.password} onChange={e => (state.password = e.target.value)} spellCheck={false} {...{ autocomplete: 'off' }} style={{ width: 'calc(100% - 45px)' }} />

                        <Button h="2rem" w="5rem" onClick={toggleShowPw}>
                            {showPw ? 'Hide' : 'Show'}
                        </Button>

                        <Tooltip label={'Generate new random password'} placement="top" hasArrow>
                            <Button onClick={() => (state.password = generatePassword(30))} variant="ghost" width="35px" display="inline-flex">
                                <ReloadOutlined />
                            </Button>
                        </Tooltip>
                    </Flex>
                </Label>

                <Label text="Mechanism">
                    {/* <Select options={[
                    { label: 'SCRAM-SHA-256', value: 'SCRAM-SHA-256' },
                    { label: 'SCRAM-SHA-512', value: 'SCRAM-SHA-512' },
                ]}
                    value={state.mechanism}
                    onChange={e => state.mechanism = e}
                /> */}

                <Select
                    style={{ width: '300px' }}
                    value={state.mechanism}
                    onChange={e => state.mechanism = e}
                >
                    <Select.Option value="SCRAM-SHA-256">SCRAM-SHA-256</Select.Option>
                    <Select.Option value="SCRAM-SHA-512">SCRAM-SHA-512</Select.Option>
                </Select>
            </Label>

            </div>
        </div>
    );
});

export function generatePassword(length: number): string {
    if (length <= 0) return '';

    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const uppercase = lowercase.toUpperCase();
    const numbers = '0123456789';
    const special = '.,&_+|[]/-()';

    const alphabet = lowercase + uppercase + numbers + special;

    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);

    let result = '';
    for (const n of randomValues) {
        const index = n % alphabet.length;
        const sym = alphabet[index];

        result += sym;
    }

    return result;
}
