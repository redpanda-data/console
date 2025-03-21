import type { ReactNode } from 'react';

interface ChatTypingIndicatorProps {
  text: ReactNode;
}

export const ChatTypingIndicator = ({ text }: ChatTypingIndicatorProps) => (
  <div className="flex justify-start">
    <div className="p-3 rounded-lg bg-white text-slate-900 border border-slate-200 max-w-[80%]">
      <div className="flex items-center space-x-1">
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-75" />
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-150" />
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-300" />
        <span className="text-xs text-slate-500 ml-2">{text}</span>
      </div>
    </div>
  </div>
);
