import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { QuickAddSecrets } from 'components/ui/secret/quick-add-secrets';
import { AlertTriangle } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useState } from 'react';

export const AddSecretsDialog = ({
  isOpen,
  onClose,
  missingSecrets,
  existingSecrets,
  onSecretsCreated,
  onUpdateEditorContent,
}: {
  isOpen: boolean;
  onClose: () => void;
  missingSecrets: string[];
  existingSecrets: string[];
  onSecretsCreated: () => void;
  onUpdateEditorContent?: (oldName: string, newName: string) => void;
}) => {
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const handleError = (errors: string[]) => {
    setErrorMessages(errors);
  };

  const handleSecretsCreated = () => {
    setErrorMessages([]);
    onSecretsCreated();
  };

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Add secrets</DialogTitle>
          <DialogDescription>Add secrets to your pipeline.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {errorMessages.length > 0 && (
            <Alert className="mb-4" variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  {errorMessages.map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
          <QuickAddSecrets
            enableNewSecrets
            existingSecrets={existingSecrets}
            onError={handleError}
            onSecretsCreated={handleSecretsCreated}
            onUpdateEditorContent={onUpdateEditorContent}
            requiredSecrets={missingSecrets}
            scopes={[Scope.REDPANDA_CONNECT]}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
