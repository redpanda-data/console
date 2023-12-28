import {
    Box,
    Button,
    Checkbox,
    CopyButton,
    Flex,
    FormField,
    Input,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    PasswordInput,
    Tooltip,
    Text,
    createStandaloneToast,
    redpandaTheme,
    redpandaToastOptions,
    Grid,
    Alert,
    AlertIcon,
} from '@redpanda-data/ui';
import { generatePassword } from './CreateServiceAccountEditor';
import { AclRequestDefault, CreateUserRequest } from '../../../state/restInterfaces';
import { openModal } from '../../../utils/ModalContainer';
import { observable } from 'mobx';
import { observer } from 'mobx-react';
import { ReloadOutlined } from '@ant-design/icons';
import { SingleSelect } from '../../misc/Select';
import { api } from '../../../state/backendApi';
import { CheckCircleIcon } from '@chakra-ui/icons';

const { ToastContainer, toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: {
        ...redpandaToastOptions.defaultOptions,
        isClosable: false,
        duration: 2000,
    },
});

export type CreateUserModalState = CreateUserRequest & {
    generateWithSpecialChars: boolean;
    step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION';
    isCreating: boolean;
    isValidUsername: boolean;
    isValidPassword: boolean;
};

const CreateUserRootModal = observer(
    (p: {
        state: CreateUserModalState;
        onCreateUser: (state: CreateUserModalState) => Promise<boolean>;
        closeModal: () => void;
    }) => {
        return (
            <Modal isOpen onClose={p.closeModal} isCentered size="2xl">
                {p.state.step === 'CREATE_USER' ? <CreateUserModal {...p} /> : <CreateUserConfirmationModal {...p} />}
            </Modal>
        );
    }
);

const CreateUserModal = observer(
    (p: {
        state: CreateUserModalState;
        onCreateUser: (state: CreateUserModalState) => Promise<boolean>;
        closeModal: () => void;
    }) => {
        const isValidUsername = /^[a-zA-Z0-9._@-]+$/.test(p.state.username);
        const isValidPassword = p.state.password && p.state.password.length >= 4 && p.state.password.length <= 64;

        return (
            <>
                <ModalOverlay />
                <ModalContent>
                    <ToastContainer />
                    <ModalHeader mr="4">Create user</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <Flex gap="2em" direction="column">
                            <FormField
                                description="Must not contain any whitespace. Dots, hyphens and underscores may be used."
                                label="Username"
                                showRequiredIndicator
                                isInvalid={!isValidUsername}
                                errorText="The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens."
                            >
                                <Input
                                    value={p.state.username}
                                    onChange={(v) => (p.state.username = v.target.value)}
                                    width="100%"
                                    autoFocus
                                    spellCheck={false}
                                    placeholder="Username"
                                    autoComplete="off"
                                />
                            </FormField>

                            <FormField
                                description="Must be at least 4 characters and should not exceed 64 characters."
                                showRequiredIndicator={true}
                                label="Password"
                            >
                                <Flex direction="column" gap="2">
                                    <Flex alignItems="center" gap="2">
                                        <PasswordInput
                                            name="test"
                                            value={p.state.password}
                                            onChange={(e) => (p.state.password = e.target.value)}
                                            isInvalid={!isValidPassword}
                                        />

                                        <Tooltip label={'Generate new random password'} placement="top" hasArrow>
                                            <Button
                                                onClick={() =>
                                                    (p.state.password = generatePassword(
                                                        30,
                                                        p.state.generateWithSpecialChars
                                                    ))
                                                }
                                                variant="ghost"
                                                width="35px"
                                                display="inline-flex"
                                            >
                                                <ReloadOutlined />
                                            </Button>
                                        </Tooltip>
                                        <Tooltip label={'Copy password'} placement="top" hasArrow>
                                            <CopyButton content={p.state.password} variant="ghost" />
                                        </Tooltip>
                                    </Flex>
                                    <Checkbox
                                        isChecked={p.state.generateWithSpecialChars}
                                        onChange={(e) => {
                                            p.state.generateWithSpecialChars = e.target.checked;
                                            p.state.password = generatePassword(30, e.target.checked);
                                        }}
                                    >
                                        Generate with special characters
                                    </Checkbox>
                                </Flex>
                            </FormField>

                            <FormField label="SASL Mechanism" showRequiredIndicator>
                                <SingleSelect<'SCRAM-SHA-256' | 'SCRAM-SHA-512'>
                                    options={[
                                        {
                                            value: 'SCRAM-SHA-256',
                                            label: 'SCRAM-SHA-256',
                                        },
                                        {
                                            value: 'SCRAM-SHA-512',
                                            label: 'SCRAM-SHA-512',
                                        },
                                    ]}
                                    value={p.state.mechanism}
                                    onChange={(e) => {
                                        p.state.mechanism = e;
                                    }}
                                />
                            </FormField>
                        </Flex>
                    </ModalBody>

                    <ModalFooter>
                        <Button
                            mr={3}
                            onClick={() => {
                                p.onCreateUser(p.state);
                            }}
                            isDisabled={p.state.isCreating || !isValidUsername || !isValidPassword}
                            isLoading={p.state.isCreating}
                            loadingText="Creating..."
                        >
                            Create
                        </Button>
                        <Button variant="outline" onClick={p.closeModal} isDisabled={p.state.isCreating}>
                            Cancel
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </>
        );
    }
);

const CreateUserConfirmationModal = observer((p: { state: CreateUserModalState; closeModal: () => void }) => {
    return (
        <>
            <ModalOverlay />
            <ModalContent>
                <ToastContainer />
                <ModalHeader mr="4">
                    <Flex alignItems="center">
                        <CheckCircleIcon color="green.500" mr={2} transform="translateY(-1px)" />
                        User created
                    </Flex>
                </ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <Grid templateColumns="max-content 1fr" gridRowGap={2} gridColumnGap={6} alignItems="center">
                        <Box fontWeight="bold" data-testid="username">
                            Username
                        </Box>
                        <Box>
                            <Flex alignItems="center" gap={2}>
                                <Text textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden" isTruncated={true}>
                                    {p.state.username}
                                </Text>

                                <Tooltip label={'Copy username'} placement="top" hasArrow>
                                    <CopyButton content={p.state.username} variant="ghost" />
                                </Tooltip>
                            </Flex>
                        </Box>

                        <Box fontWeight="bold" data-testid="password">
                            Password
                        </Box>
                        <Box>
                            <Flex alignItems="center" gap={2}>
                                <PasswordInput
                                    name="test"
                                    value={p.state.password}
                                    isDisabled={true}
                                    isReadOnly={true}
                                />

                                <Tooltip label={'Copy password'} placement="top" hasArrow>
                                    <CopyButton content={p.state.password} variant="ghost" />
                                </Tooltip>
                            </Flex>
                        </Box>

                        <Box fontWeight="bold" data-testid="password">
                            Mechanism
                        </Box>
                        <Box>
                            <Text textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden" isTruncated={true}>
                                {p.state.mechanism}
                            </Text>
                        </Box>
                    </Grid>

                    <Alert status="info" variant="left-accent" mt={4}>
                        <AlertIcon />
                        You can't see the user's password again after this modal is closed.
                    </Alert>
                </ModalBody>

                <ModalFooter>
                    <Button onClick={p.closeModal}>Close</Button>
                </ModalFooter>
            </ModalContent>
        </>
    );
});

export function openCreateUserModal() {
    const state = observable({
        username: '',
        password: generatePassword(30, false),
        mechanism: 'SCRAM-SHA-256',
        generateWithSpecialChars: false,
        step: 'CREATE_USER',
        isCreating: false,
        isValidUsername: false,
        isValidPassword: false,
    } as CreateUserModalState);

    const onCreateUser = async (state: CreateUserModalState): Promise<boolean> => {
        try {
            state.isCreating = true;
            await api.createServiceAccount({
                username: state.username,
                password: state.password,
                mechanism: state.mechanism,
            });

            // Refresh user list
            if (api.userData != null && !api.userData.canListAcls) return false;
            await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), api.refreshServiceAccounts(true)]);
            state.step = 'CREATE_USER_CONFIRMATION';
        } catch (err) {
            toast({
                status: 'error',
                duration: null,
                isClosable: true,
                title: 'Failed to create user',
                description: String(err),
            });
        } finally {
            state.isCreating = false;
        }
        return true;
    };

    openModal(CreateUserRootModal, {
        state: state,
        onCreateUser: onCreateUser,
    });
}
