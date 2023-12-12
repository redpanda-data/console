import { observer } from 'mobx-react';
import { openModal } from '../../../utils/ModalContainer';
import { Alert, AlertIcon, Box, Button, Flex, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text, ThemeTypings } from '@redpanda-data/ui';
import { useState } from 'react';
import { WarningIcon } from '@chakra-ui/icons';


const GenericModal = observer((p: {
    title: JSX.Element;
    body: JSX.Element;
    primaryButtonContent: JSX.Element;
    secondaryButtonContent: JSX.Element;

    onPrimaryButton: (closeModal: () => void) => void,
    onSecondaryButton: (closeModal: () => void) => void,

    primaryColorScheme?: ThemeTypings['colorSchemes']

    closeModal: () => void;
}) => {

    return <Modal isOpen onClose={p.closeModal} isCentered size="2xl">
        <ModalOverlay />
        <ModalContent>
            <ModalHeader mr="4">{p.title}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
                {p.body}
            </ModalBody>

            <ModalFooter>
                <Button mr={3} onClick={() => p.onPrimaryButton(p.closeModal)} colorScheme={p.primaryColorScheme}>
                    {p.primaryButtonContent}
                </Button>
                <Button variant="outline" onClick={() => p.onSecondaryButton(p.closeModal)}>
                    {p.secondaryButtonContent}
                </Button>
            </ModalFooter>
        </ModalContent>
    </Modal>
});

const ExplicitConfirmModal = observer((p: {
    title: JSX.Element;
    body: JSX.Element;
    primaryButtonContent: JSX.Element;
    secondaryButtonContent: JSX.Element;

    onPrimaryButton: (closeModal: () => void) => void,
    onSecondaryButton: (closeModal: () => void) => void,

    closeModal: () => void;
}) => {

    const [confirmBoxText, setConfirmBoxText] = useState('');
    const isConfirmEnabled = confirmBoxText == 'delete';

    return <Modal isOpen onClose={p.closeModal} isCentered size="2xl">
        <ModalOverlay />
        <ModalContent>
            <ModalHeader mr="4">{p.title}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
                {p.body}

                <Box mt="4">
                    To confirm, enter "delete":
                    <Input onChange={e => setConfirmBoxText(e.target.value)} autoFocus />
                </Box>
            </ModalBody>

            <ModalFooter>
                <Button mr={3} isDisabled={!isConfirmEnabled} onClick={() => p.onPrimaryButton(p.closeModal)} colorScheme="red">
                    {p.primaryButtonContent}
                </Button>
                <Button variant="outline" onClick={() => p.onSecondaryButton(p.closeModal)}>
                    {p.secondaryButtonContent}
                </Button>
            </ModalFooter>
        </ModalContent>
    </Modal>
});

// A type of modal that simply shows some stuff and only has an "ok" button
const InfoModal = observer((p: {
    title: JSX.Element;
    body: JSX.Element;
    primaryButtonContent: JSX.Element;
    onClose?: () => void;
    closeModal: () => void;
}) => {

    return <Modal isOpen onClose={p.closeModal} isCentered size="2xl">
        <ModalOverlay />
        <ModalContent>
            <ModalHeader mr="4">{p.title}</ModalHeader>
            <ModalBody>
                {p.body}
            </ModalBody>
            <ModalFooter>
                <Button mr={3} onClick={() => {
                    if (p.onClose)
                        p.onClose();
                    p.closeModal();
                }}>
                    {p.primaryButtonContent}
                </Button>

            </ModalFooter>
        </ModalContent>
    </Modal>
});

export function openInfoModal(p: {
    title: JSX.Element;
    body: JSX.Element;
    btnContent?: JSX.Element;
    onClose?: () => void;
}) {
    openModal(InfoModal, {
        title: p.title,
        body: p.body,
        primaryButtonContent: p.btnContent ?? <>Close</>,
        onClose: p.onClose,
    });
}

export function openValidationErrorsModal(result: {
    isValid: boolean;
    errorDetails?: string | undefined;
    isCompatible?: boolean | undefined;
}) {
    const { isValid, errorDetails, isCompatible } = result;

    const compatBox = (isCompatible == undefined || isValid == false)
        ? <></>
        : isCompatible
            ? <Alert status="success" variant="subtle">
                <AlertIcon />
                No compatibility issues
            </Alert>
            : <Alert status="error" variant="subtle">
                <AlertIcon />
                Compatibility issues found
            </Alert>

    const errDetailsBox = errorDetails
        ? <Box>
            <Box maxHeight="400px" overflowY="auto" p="6" background="gray.100" fontFamily="monospace" letterSpacing="-0.5px">
                {errorDetails?.trim()}
            </Box>
        </Box>
        : <></>;


    openInfoModal({
        title: <>
            <Text color="red.500" display="flex" alignItems="center">
                <WarningIcon fontSize="1.18em" mr="3" />
                Schema validation error
            </Text>
        </>,
        body: <>
            <Text mb="3">Schema validation failed due to the following error.</Text>
            <Flex direction="column" gap="4">
                {compatBox}
                {errDetailsBox}
            </Flex>
        </>,
    });
}

export function openDeleteModal(
    schemaVersionName: string,
    onConfirm: () => void
) {

    openModal(GenericModal, {
        title: <>Delete schema version {schemaVersionName}</>,
        body: <>
            This is a soft-delete operation. This schema version will remain readable. It can also be permanently deleted or recovered.
            {' '}{/* <Link>Learn more</Link> */}
            <br />
            <br />
            Are you sure?
        </>,
        primaryButtonContent: <>Delete</>,
        primaryColorScheme: 'red',

        secondaryButtonContent: <>Cancel</>,

        onPrimaryButton: (closeModal) => {
            onConfirm();
            closeModal();
        },

        onSecondaryButton: (closeModal) => {
            closeModal();
        },
    });

}



export function openPermanentDeleteModal(
    schemaVersionName: string,
    onConfirm: () => void
) {

    openModal(ExplicitConfirmModal, {
        title: <>Permanently delete schema version {schemaVersionName}</>,
        body: <>
            After this schema is permanently deleted, all metadata is removed and it is unrecoverable.
        </>,
        primaryButtonContent: <>Delete</>,
        secondaryButtonContent: <>Cancel</>,

        onPrimaryButton: (closeModal) => {
            onConfirm();
            closeModal();
        },

        onSecondaryButton: (closeModal) => {
            closeModal();
        },
    });

}
export function openSwitchSchemaFormatModal(
    onConfirm: () => void
) {
    openModal(GenericModal, {
        title: <>Switch schema format?</>,
        body: <>
            Switching schema formats will reset the schema you've started with and you will lose your progress.
            <br />
            Are you sure?
        </>,
        primaryButtonContent: <>Switch format</>,
        secondaryButtonContent: <>Cancel</>,

        onPrimaryButton: (closeModal) => {
            onConfirm();
            closeModal();
        },

        onSecondaryButton: (closeModal) => {
            closeModal();
        },
    });

}
