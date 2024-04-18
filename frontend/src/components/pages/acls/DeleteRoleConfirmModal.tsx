import { FC } from 'react';
import { Text, ConfirmItemDeleteModal } from '@redpanda-data/ui';


export const DeleteRoleConfirmModal: FC<{
    roleName: string;
    numberOfPrincipals: number;
    onConfirm: () => void;
    buttonEl: React.ReactElement
}> = ({ roleName, numberOfPrincipals, onConfirm, buttonEl }) => {
    return (
        <ConfirmItemDeleteModal heading={'Delete role ' + roleName} itemType="role" trigger={buttonEl} primaryActionLabel="Delete" secondaryActionLabel="Cancel" onConfirm={onConfirm} inputMatchText={roleName}>
            <Text>This role is assigned to {numberOfPrincipals} {numberOfPrincipals === 1 ? 'principal' : 'principals'}. Deleting it will remove it from these principals and take those permissions away. The ACLs will all be deleted.</Text>
            <Text>To restore the permissions, the role will need to be recreated and reassigned to these principals. To confirm, type the role name in the confirmation box below.</Text>
        </ConfirmItemDeleteModal>
    )
}
