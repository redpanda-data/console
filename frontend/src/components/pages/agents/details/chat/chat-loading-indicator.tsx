export const ChatLoadingIndicator = () => {
  return (
    <div className="flex justify-center items-center h-[calc(100vh-200px)]">
      <div className="animate-pulse text-slate-500">Loading messages...</div>
    </div>
  );
};
