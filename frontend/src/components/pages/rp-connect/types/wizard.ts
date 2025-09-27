import type { ConnectComponentType } from './rpcn-schema';

export type ConnectTilesFormData = {
  connectionName?: string;
  connectionType?: ConnectComponentType;
};
export interface FormSubmitResult {
  success: boolean;
  message?: string;
  error?: string;
}
