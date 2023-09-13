import { observer } from 'mobx-react';
import { openModal } from '../../../utils/ModalContainer';
import { Box, Button, Input, Link, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay } from '@redpanda-data/ui';
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
