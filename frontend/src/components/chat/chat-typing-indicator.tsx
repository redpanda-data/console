import type { ReactNode } from 'react';

type ChatTypingIndicatorProps = {
  text: ReactNode;
};

export const ChatTypingIndicator = ({ text }: ChatTypingIndicatorProps) => (
  <div className="flex justify-start p-4">
    <div className="max-w-[80%] rounded-lg border border-slate-200 bg-white p-3 text-slate-900">
      <div className="flex items-center space-x-1">
        <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-75" />
        <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-150" />
        <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400 delay-300" />
        <span className="ml-2 text-slate-500 text-xs">{text}</span>
      </div>
    </div>
  </div>
);
