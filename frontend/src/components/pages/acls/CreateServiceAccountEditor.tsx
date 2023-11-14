import { ReloadOutlined } from '@ant-design/icons';
import { Button, Input, Flex, Checkbox, FormField, CopyButton } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { CreateUserRequest } from '../../../state/restInterfaces';
import { Tooltip, PasswordInput } from '@redpanda-data/ui';
import { SingleSelect } from '../../misc/Select';

export const CreateServiceAccountEditor = observer((p: { state: CreateUserRequest }) => {
    const state = p.state;
    const [allowSpecialChars, setAllowSpecialChars] = useState(false);

    return (
        <div>
            <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
                <FormField
                    description="Must not contain any whitespace. Dots, hyphens and underscores may be used."
                    label="Username"
                    isInvalid={ /[^a-zA-Z0-9._@-]+/.test(state.username) }
                    errorText="The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens.">

                    <Input
                        value={state.username}
                        onChange={v => state.username = v.target.value}
                        width="100%"
                        autoFocus
                        spellCheck={false}
                        placeholder="Username"
                        autoComplete="off"
                    />
                </FormField>

                <FormField
                    description="Must be at least 4 characters and should not exceed 64 characters."
                    label="Password">

                    <Flex direction="column" gap="2">
                        <Flex alignItems="center" gap="2">
                            <PasswordInput 
                                name="test" 
                                value={state.password} 
                                onChange={e => (state.password = e.target.value)} 
                                isInvalid={state.password.length <= 3 || state.password.length > 64}
                                /> 

                            <Tooltip label={'Generate new random password'} placement="top" hasArrow>
                                <Button onClick={() => state.password = generatePassword(30, allowSpecialChars)} variant="ghost" width="35px" display="inline-flex">
                                    <ReloadOutlined />
                                </Button>
                            </Tooltip>
                            <Tooltip label={'Copy password'} placement="top" hasArrow>
                                <CopyButton content={state.password} variant="ghost"/>
                            </Tooltip>
                        </Flex>
                        <Checkbox isChecked={allowSpecialChars} onChange={(e) => {setAllowSpecialChars(e.target.checked); state.password = generatePassword(30, e.target.checked)}}>Generate with special characters</Checkbox>
                    </Flex>
                </FormField>


                <FormField label="SASL Mechanism">
                    <SingleSelect<'SCRAM-SHA-256' | 'SCRAM-SHA-512'> options={[{
                        value: 'SCRAM-SHA-256',
                        label: 'SCRAM-SHA-256',
                    }, {
                        value: 'SCRAM-SHA-512',
                        label: 'SCRAM-SHA-512',
                    }]} value={state.mechanism} onChange={e => {
                        state.mechanism = e;
                    }}/>
                </FormField>

            </div>
        </div>
    );
});

export function generatePassword(length: number, allowSpecialChars: boolean): string {
    if (length <= 0) return '';

    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const uppercase = lowercase.toUpperCase();
    const numbers = '0123456789';
    const special = '.,&_+|[]/-()';

    let alphabet = lowercase + uppercase + numbers;
    if (allowSpecialChars) {
        alphabet += special;
    }

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
