import { config } from 'config';
import type { ChatMessage } from 'database/chat-db';

interface ChatApiResponse {
  message: string;
  success: boolean;
  error?: string;
}

// Limit chat history to last 30 messages
export const CHAT_HISTORY_MESSAGE_LIMIT = 15;

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

    const body = {
      question: message,
      history: recentHistory.map((msg) => ({
        // Map 'system' to 'assistant' to match the new API’s expected roles
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
    };

    const response = await fetch(`${agentUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const { value } = (await reader?.read()) || {};
    const text = new TextDecoder().decode(value);

    try {
      return {
        message: text,
        success: true,
      } as ChatApiResponse;
    } catch (err) {
      console.error('Error parsing API response:', err);
      return {
        success: false,
        message: 'Failed to parse server response',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  } catch (error) {
    console.error('Error sending message to API:', error);
    return {
      success: false,
      message: 'Failed to send message to server. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
