import { Button } from 'components/redpanda-ui/components/button';
import { Input } from 'components/redpanda-ui/components/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { useRef, useState } from 'react';

export type SecretInputProps = {
  value: string;
  onChange: (v: string) => void;
  updating: boolean;
};

const EditButton = ({ onClick }: { onClick: () => void }) => (
  // Without a provider the trigger falls back to Base UI's 600ms open delay; the app's is 150ms.
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button onClick={onClick} variant="link">
            Edit
          </Button>
        }
      />
      <TooltipContent side="top">Edit secret value</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const ClearButton = ({ onClick }: { onClick: () => void }) => (
  <Button onClick={onClick} variant="link">
    Undo
  </Button>
);

export const SecretInput = ({ value, onChange, updating = false }: SecretInputProps) => {
  const initialValueRef = useRef(value);
  const [canEdit, setCanEdit] = useState(!updating);
  // Intentionally seeded from prop: localValue is edited independently during user interaction
  const [localValue, setLocalValue] = useState(() => value);

  const editButton = (
    <EditButton
      onClick={() => {
        setCanEdit(true);
        setLocalValue('');
      }}
    />
  );

  const clearButton = (
    <ClearButton
      onClick={() => {
        setCanEdit(false);
        setLocalValue(initialValueRef.current);
        onChange(initialValueRef.current);
      }}
    />
  );

  return (
    <div className="flex flex-row gap-2">
      {/*
        The Registry Input owns the reveal toggle for `type="password"`, and disables it while the
        field is read-only — which is the state an existing secret sits in before Edit. `key` is
        what re-masks on Undo: the toggle's state lives inside the Input, so the transition out of
        editing has to remount it or Undo would leave the restored secret in plain text.
      */}
      <Input
        key={canEdit ? 'editing' : 'masked'}
        onChange={(e) => {
          setLocalValue(e.target.value);
          if (onChange) {
            onChange(e.target.value);
          }
        }}
        readOnly={!canEdit}
        type="password"
        value={localValue}
      />
      {Boolean(updating) && (canEdit ? clearButton : editButton)}
    </div>
  );
};

export default SecretInput;
