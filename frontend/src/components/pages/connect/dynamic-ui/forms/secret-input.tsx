import { Button } from 'components/redpanda-ui/components/button';
import { Input } from 'components/redpanda-ui/components/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { useRef, useState } from 'react';

export type SecretInputProps = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  updating: boolean;
};

const EditButton = ({ onClick }: { onClick: () => void }) => (
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

/**
 * Uses its own edit buffer. Undo must remount the password input so the registry's reveal state cannot leave the restored secret visible.
 */
export const SecretInput = ({ id, value, onChange, required, updating = false }: SecretInputProps) => {
  const initialValueRef = useRef(value);
  const [canEdit, setCanEdit] = useState(!updating);
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
      <Input
        id={id}
        key={canEdit ? 'editing' : 'masked'}
        onChange={(e) => {
          setLocalValue(e.target.value);
          if (onChange) {
            onChange(e.target.value);
          }
        }}
        readOnly={!canEdit}
        required={required}
        type="password"
        value={localValue}
      />
      {Boolean(updating) && (canEdit ? clearButton : editButton)}
    </div>
  );
};

export default SecretInput;
