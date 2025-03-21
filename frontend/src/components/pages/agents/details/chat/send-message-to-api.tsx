import type { ChatMessage } from 'database/chat-db';
import fetchWithTimeout from 'utils/fetchWithTimeout';

const API_TIMEOUT = 15000; // 15 seconds

interface ChatApiResponse {
  message: string;
  success: boolean;
  error?: string;
}

interface ChatApiRequest {
  message: string;
  history: {
    content: string;
    sender: 'user' | 'system';
    timestamp: string;
  }[];
}

// Limit chat history to last 30 messages
export const CHAT_HISTORY_MESSAGE_LIMIT = 30;

interface SendMessageToApiProps {
  message: string;
  chatHistory: ChatMessage[];
  agentUrl?: string;
}

export const sendMessageToApi = async ({
  message,
  chatHistory,
  agentUrl,
}: SendMessageToApiProps): Promise<ChatApiResponse> => {
  try {
    const recentHistory = chatHistory.slice(-CHAT_HISTORY_MESSAGE_LIMIT);

    // Format chat history for the API request
    const formattedHistory = recentHistory.map((msg) => ({
      content: msg.content,
      sender: msg.sender,
      timestamp: msg.timestamp.toISOString(),
    }));

    const payload: ChatApiRequest = {
      message,
      history: formattedHistory,
    };

    const response = await fetchWithTimeout(`${agentUrl}/post/chat`, API_TIMEOUT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    return (await response.json()) as ChatApiResponse;
  } catch (error) {
    console.error('Error sending message to API:', error);
    return {
      success: false,
      message: 'Failed to send message to server. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
