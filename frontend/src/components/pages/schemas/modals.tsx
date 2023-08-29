import { observer } from 'mobx-react';
import { openModal } from '../../../utils/ModalContainer';
import { Button, Link, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay } from '@redpanda-data/ui';


const GenericModal = observer((p: {
    title: JSX.Element;
    body: JSX.Element;
    primaryButtonContent: JSX.Element;
    secondaryButtonContent: JSX.Element;

    onPrimaryButton: (closeModal: () => void) => void,
    onSecondaryButton: (closeModal: () => void) => void,

    closeModal: () => void;
}) => {

    return <Modal isOpen onClose={p.closeModal} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
            <ModalHeader>{p.title}</ModalHeader>
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
            <Link>Learn more</Link>
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
