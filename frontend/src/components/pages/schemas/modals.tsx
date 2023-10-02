import { observer } from 'mobx-react';
import { openModal } from '../../../utils/ModalContainer';
import { Alert, AlertIcon, Box, Button, Flex, Input, Link, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay } from '@redpanda-data/ui';
import { useState } from 'react';


const GenericModal = observer((p: {
    title: JSX.Element;
    body: JSX.Element;
    primaryButtonContent: JSX.Element;
    secondaryButtonContent: JSX.Element;

    onPrimaryButton: (closeModal: () => void) => void,
    onSecondaryButton: (closeModal: () => void) => void,

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
                <Button mr={3} onClick={() => p.onPrimaryButton(p.closeModal)}>
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
                    To confirm this action, type 'delete' in the box below:
                    <Input onChange={e => setConfirmBoxText(e.target.value)} />
                </Box>
            </ModalBody>

            <ModalFooter>
                <Button mr={3} isDisabled={!isConfirmEnabled} onClick={() => p.onPrimaryButton(p.closeModal)}>
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

export function openValidationResultModal(result: {
    isValid: boolean;
    errorDetails?: string | undefined;
    isCompatible?: boolean | undefined;
}) {
    const { isValid, errorDetails, isCompatible } = result;

    const validBox = isValid
        ? <Alert status="success" variant="subtle">
            <AlertIcon />
            Schema validated successfully
        </Alert>
        : <Alert status="error" variant="subtle">
            <AlertIcon />
            Schema validation failed
        </Alert>

    const compatBox = isCompatible == undefined
        ? <></>
        : isCompatible
            ? <Alert status="success" variant="subtle">
                <AlertIcon />
                No compatability issues
            </Alert>
            : <Alert status="error" variant="subtle">
                <AlertIcon />
                Compatability issues found
            </Alert>

    const errDetailsBox = errorDetails
        ? <Box>
            <Box maxHeight="400px" overflowY="auto" p="4" background="gray.100">
                {errorDetails?.trim()}
            </Box>
        </Box>
        : <></>;


    openInfoModal({
        title: <>Schema validation</>,
        body: <>
            <Flex direction="column" gap="4">
                {validBox}
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
            {' '}<Link>Learn more</Link>
            <br />
            <br />
            Are you sure?
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



export function openPermanentDeleteModal(
    schemaVersionName: string,
    onConfirm: () => void
) {

    openModal(ExplicitConfirmModal, {
        title: <>Delete schema version {schemaVersionName}</>,
        body: <>
            Once this schema is permanently deleted, all metadata will be removed and it will be unrecoverable.
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
