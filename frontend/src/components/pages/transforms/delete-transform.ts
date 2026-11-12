import { transformsApi } from '../../../state/backend-api';
import { reportActionError, showToast } from '../../../utils/toast.utils';

/** Deletion errors and the follow-up list refresh have distinct ownership and messages. */
export async function deleteTransformAndRefresh(name: string): Promise<void> {
  try {
    await transformsApi.deleteTransform(name);
  } catch (error) {
    showToast({ status: 'error', title: 'Failed to delete transform', description: String(error) });
    return;
  }
  showToast({ status: 'success', duration: 4000, title: 'Transform deleted' });
  await transformsApi.refreshTransforms(true).catch(reportActionError);
}
