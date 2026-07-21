import { WarningIcon } from 'components/icons';
import { Alert, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import type { ReactNode } from 'react';
import { useState } from 'react';

export function DeleteDialog(p: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemaVersionName: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog onOpenChange={p.onOpenChange} open={p.open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Delete schema version {p.schemaVersionName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            This is a soft-delete operation. This schema version will remain readable. It can also be permanently
            deleted or recovered.
            <br />
            <br />
            Are you sure?
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => p.onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={() => {
              p.onConfirm();
              p.onOpenChange(false);
            }}
            variant="destructive"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PermanentDeleteDialog(p: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemaVersionName: string;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const isConfirmEnabled = confirmText === 'delete';

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setConfirmText('');
        p.onOpenChange(open);
      }}
      open={p.open}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Permanently delete schema version {p.schemaVersionName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            After this schema is permanently deleted, all metadata is removed and it is unrecoverable.
          </DialogDescription>
          <div className="mt-4">
            To confirm, enter "delete":
            <Input onChange={(e) => setConfirmText(e.target.value)} value={confirmText} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => p.onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!isConfirmEnabled}
            onClick={() => {
              p.onConfirm();
              setConfirmText('');
              p.onOpenChange(false);
            }}
            variant="destructive"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SwitchSchemaFormatDialog(p: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog onOpenChange={p.onOpenChange} open={p.open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Switch schema format?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            Switching schema formats will reset the schema you've started with and you will lose your progress.
            <br />
            Are you sure?
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => p.onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={() => {
              p.onConfirm();
              p.onOpenChange(false);
            }}
          >
            Switch format
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ValidationErrorsDialog(p: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: {
    isValid: boolean;
    errorDetails?: string | undefined;
    isCompatible?: boolean | undefined;
    compatibilityError?: { errorType: string; description: string } | undefined;
  } | null;
  onClose?: () => void;
}) {
  if (!(p.result && p.open)) return null;

  const { isValid, errorDetails, isCompatible, compatibilityError } = p.result;

  let compatBox: ReactNode = null;
  if (isCompatible !== undefined && isValid !== false) {
    if (isCompatible) {
      compatBox = (
        <Alert variant="success">
          <AlertTitle>No compatibility issues</AlertTitle>
        </Alert>
      );
    } else {
      compatBox = (
        <Alert variant="destructive">
          <AlertTitle>Compatibility issues found</AlertTitle>
        </Alert>
      );
    }
  }

  const compatErrorBox =
    compatibilityError && (compatibilityError.errorType || compatibilityError.description) ? (
      <div>
        <p className="mb-2 font-semibold">Compatibility Error Details:</p>
        <div className="max-h-[400px] overflow-y-auto rounded bg-muted p-6">
          {Boolean(compatibilityError.errorType) && (
            <p className="mb-2 font-bold text-destructive">Error: {compatibilityError.errorType.replace(/_/g, ' ')}</p>
          )}
          {Boolean(compatibilityError.description) && (
            <p className="leading-relaxed">{compatibilityError.description}</p>
          )}
        </div>
      </div>
    ) : null;

  const errDetailsBox = errorDetails ? (
    <div>
      <p className="mb-2 font-semibold">Parsing Error:</p>
      <div className="max-h-[400px] overflow-y-auto rounded bg-muted p-6 font-mono tracking-tight">
        {errorDetails?.trim()}
      </div>
    </div>
  ) : null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) p.onClose?.();
        p.onOpenChange(open);
      }}
      open={p.open}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center text-destructive">
            <WarningIcon className="mr-3 shrink-0" size={18} />
            Schema validation error
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3">Schema validation failed due to the following error.</p>
          <div className="flex flex-col gap-4">
            {compatBox}
            {compatErrorBox}
            {errDetailsBox}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => p.onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
