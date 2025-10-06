import { Button } from '@redpanda-data/ui';

interface ChatClearButtonProps {
  onClear: () => void;
}

export const ChatClearButton = ({ onClear }: ChatClearButtonProps) => (
  <div className="flex justify-end mb-2">
    <Button aria-label="Clear chat history" colorScheme="red" onClick={onClear} size="xs" variant="ghost">
      Clear History
    </Button>
  </div>
);
