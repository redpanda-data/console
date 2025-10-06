import { Button } from '@redpanda-data/ui';
import type { MouseEvent } from 'react';

type SendMessageButtonProps = {
  inputValue: string;
  isSending: boolean;
  onClick: (e: MouseEvent) => void;
};

export const SendMessageButton = ({ inputValue, isSending, onClick }: SendMessageButtonProps) => (
  <Button
    aria-label="Send message"
    bottom="3"
    height="auto"
    isDisabled={!inputValue.trim() || isSending}
    isLoading={isSending}
    loadingText="Sending"
    onClick={onClick}
    position="absolute"
    right="3"
    size="sm"
    type="submit"
    variant="primary"
  >
    {isSending ? (
      <span className="flex items-center">
        <svg
          aria-hidden="true"
          className="-ml-1 mr-2 h-4 w-4 animate-spin text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Loading spinner</title>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            fill="currentColor"
          />
        </svg>
        Sending
      </span>
    ) : (
      'Send'
    )}
  </Button>
);
