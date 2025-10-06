import { Button } from '@redpanda-data/ui';

type ChatClearButtonProps = {
  onClear: () => void;
};

export const ChatClearButton = ({ onClear }: ChatClearButtonProps) => (
  <div className="mb-2 flex justify-end">
    <Button aria-label="Clear chat history" colorScheme="red" onClick={onClear} size="xs" variant="ghost">
      Clear History
    </Button>
  </div>
);
