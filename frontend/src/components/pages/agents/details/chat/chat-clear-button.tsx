import { Button } from '@redpanda-data/ui';

interface ChatClearButtonProps {
  onClear: () => void;
}

export const ChatClearButton = ({ onClear }: ChatClearButtonProps) => (
  <div className="flex justify-end mb-2">
    <Button size="xs" colorScheme="red" variant="ghost" onClick={onClear} aria-label="Clear chat history">
      Clear History
    </Button>
  </div>
);
