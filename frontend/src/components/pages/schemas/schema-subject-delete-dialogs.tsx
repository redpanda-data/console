import { toast } from 'sonner';

import { DeleteDialog, PermanentDeleteDialog } from './modals';
import { useDeleteSchemaSubjectMutation } from '../../../react-query/api/schema-registry';

export type DeleteTarget = {
  kind: 'soft' | 'permanent';
  name: string;
};
// Confirmation dialogs for soft- and permanently deleting the subject picked in the table.
export function SubjectDeleteDialogs({
  deleteTarget,
  onClose,
}: {
  deleteTarget: DeleteTarget | null;
  onClose: () => void;
}) {
  const deleteSchemaMutation = useDeleteSchemaSubjectMutation();

  return (
    <>
      <DeleteDialog
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: false },
            {
              onSuccess: () => toast.success('Subject soft-deleted'),
              onError: (err) => toast.error('Failed to soft-delete subject', { description: String(err) }),
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open={deleteTarget?.kind === 'soft'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
      <PermanentDeleteDialog
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: true },
            {
              onSuccess: () => toast.success('Subject permanently deleted'),
              onError: (err) => toast.error('Failed to permanently delete subject', { description: String(err) }),
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open={deleteTarget?.kind === 'permanent'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
    </>
  );
}
