import { ReloadOutlined } from '@ant-design/icons';
import { Button, Input, Select, Tooltip } from 'antd';
import { observer } from 'mobx-react';
import { CreateUserRequest } from '../../../state/restInterfaces';
import { Label, LabelTooltip } from '../../../utils/tsxUtils';

export const CreateServiceAccountEditor = observer((p: { state: CreateUserRequest }) => {

    const state = p.state;

    return <div>
        <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
            <Label
                text="Username"
                textSuffix={<LabelTooltip nowrap left>
                    The username of the service account to be created.<br />
                    Must not be empty, must not contain any whitespace (space, tab, ...)
                </LabelTooltip>}
            >
                <Input
                    value={state.username}
                    onChange={e => state.username = e.target.value}
                    width="100%" autoFocus spellCheck={false}
                    placeholder="Username"
                    autoComplete="off"
                />
            </Label>

            <Label
                text="Password"
                textSuffix={<LabelTooltip nowrap left>
                    The password for the service account.<br />
                    You can either use the randomly generated password or specify a custom one.<br />
                    The password should not exceed 64 characters.
                </LabelTooltip>}
            >
                <Input.Group compact>
                    <Input.Password
                        value={state.password}
                        onChange={e => state.password = e.target.value}
                        spellCheck={false}
                        {...{ autocomplete: 'off' }}
                        style={{ width: 'calc(100% - 45px)' }}
                    />
                    <Tooltip trigger="hover" overlay={'Generate new random password'}>
                        <Button
                            onClick={() => state.password = generatePassword(30)}
                            style={{ width: '45px' }}
                        >
                            <ReloadOutlined />
                        </Button>
                    </Tooltip>
                </Input.Group>
            </Label>

            <Label text="Mechanism">
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
