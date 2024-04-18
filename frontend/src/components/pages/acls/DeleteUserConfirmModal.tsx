import { FC } from 'react';
import { Text, ConfirmItemDeleteModal } from '@redpanda-data/ui';


export const DeleteUserConfirmModal: FC<{
    onConfirm: () => void;
    buttonEl: React.ReactElement
}> = ({ onConfirm, buttonEl }) => {
    return (
        <ConfirmItemDeleteModal heading="Delete user" itemType="user" trigger={buttonEl} primaryActionLabel="Delete" secondaryActionLabel="Cancel" onConfirm={onConfirm}>
            <Text>This user has roles and ACLs assigned to it. Those roles and ACLs will not be deleted, but the user will need to be recreated and reassigned to them to be used again. To confirm, type 'delete' in the box below.</Text>
        </ConfirmItemDeleteModal>
    )
}
