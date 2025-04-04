import type { ReactNode } from 'react';

interface AgentChatNotificationProps {
  notification: ReactNode;
}

export const AgentChatNotification = ({ notification }: AgentChatNotificationProps) => {
  return (
    <div className="pointer-events-none">
      <div className="pointer-events-auto mx-auto w-fit">
        <div className="mx-auto my-4 rounded-xl border border-secondary bg-secondary/80 px-5 py-3 text-secondary-foreground shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-4">{notification}</div>
        </div>
      </div>
    </div>
  );
};
