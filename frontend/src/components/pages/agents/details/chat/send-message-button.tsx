import { Button } from '@redpanda-data/ui';

interface SendMessageButtonProps {
  inputValue: string;
  isSending: boolean;
}

export const SendMessageButton = ({ inputValue, isSending }: SendMessageButtonProps) => {
  return (
    <Button
      variant="ghost"
      position="absolute"
      bottom="3"
      right="3"
      colorScheme="blue"
      size="sm"
      type="submit"
      aria-label="Send message"
      isDisabled={!inputValue.trim() || isSending}
      height="auto"
      py="2"
      px="4"
      isLoading={isSending}
      loadingText="Sending"
    >
      {isSending ? (
        <span className="flex items-center">
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <title>Loading spinner</title>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Sending
        </span>
      ) : (
        'Send'
      )}
    </Button>
  );
};
