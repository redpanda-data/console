import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogOverlay,
} from 'components/redpanda-ui/components/dialog';
import { Heading } from 'components/redpanda-ui/components/typography';
import { QuickAddSecrets } from 'components/secrets/quick-add-secrets';
import { AlertTriangle } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useState } from 'react';

export const AddSecretsDialog = ({
  isOpen,
  onClose,
  missingSecrets,
  existingSecrets,
  defaultValues,
  onSecretsCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  missingSecrets: string[];
  existingSecrets: string[];
  defaultValues: Record<string, string>;
  onSecretsCreated: () => void;
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogOverlay />
      <DialogContent size="xl">
        <DialogHeader>
          <Heading level={2}>Add Secrets</Heading>
        </DialogHeader>
        <DialogBody>
          {errorMessages.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  {errorMessages.map((message, index) => (
                    <div key={index}>{message}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
          <QuickAddSecrets
            requiredSecrets={missingSecrets}
            existingSecrets={existingSecrets}
            scope={Scope.REDPANDA_CONNECT}
            defaultValues={defaultValues}
            onSecretsCreated={handleSecretsCreated}
            enableNewSecrets
            onError={handleError}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
