import { Pause, Play } from 'lucide-react';

import { useWorkflowRunner } from '@/components/node-editor/hooks/use-workflow-runner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/redpanda-ui/popover';

export function AppPopover() {
  const { logMessages, runWorkflow, stopWorkflow, isRunning } = useWorkflowRunner();

  const onClickRun = () => {
    if (isRunning) {
      stopWorkflow();
      return;
    }

    runWorkflow();
  };

  return (
    <Popover>
      <PopoverTrigger
        onClick={onClickRun}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        tabIndex={0}
        aria-label={isRunning ? 'Stop Workflow' : 'Run Workflow'}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClickRun();
          }
        }}
      >
        {isRunning ? (
          <>
            <Pause /> Stop Workflow
          </>
        ) : (
          <>
            <Play /> Run Workflow
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="h-[85vh] m-4 text-xs font-mono space-y-4 overflow-y-auto">
        {logMessages.length ? (
          logMessages.map((message, index) => (
            <p key={index} className="break-words">
              {message}
            </p>
          ))
        ) : (
          <p>No log messages yet.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AppPopover;
