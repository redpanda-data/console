import { FC } from 'react';
import { Text, ConfirmItemDeleteModal } from '@redpanda-data/ui';


export const DeleteUserConfirmModal: FC<{
    userName: string;
    onConfirm: () => void;
    buttonEl: React.ReactElement
}> = ({ userName, onConfirm, buttonEl }) => {
    return (
        <ConfirmItemDeleteModal heading={'Delete user ' + userName} itemType="user" trigger={buttonEl} primaryActionLabel="Delete" secondaryActionLabel="Cancel" onConfirm={onConfirm} inputMatchText={userName}>
            <Text>This user has roles and ACLs assigned to it. Those roles and ACLs will not be deleted, but the user will need to be recreated and reassigned to them to be used again. To confirm, type the user name in the box below.</Text>
        </ConfirmItemDeleteModal>
    )
}
