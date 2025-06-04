import { Pause, Play } from 'lucide-react';

import { useWorkflowRunner } from '@/components/node-editor/hooks/use-workflow-runner';
import { Button } from '@/components/redpanda-ui/button';
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
      <PopoverTrigger asChild>
        <Button onClick={onClickRun}>
          {isRunning ? (
            <>
              <Pause /> Stop Workflow
            </>
          ) : (
            <>
              <Play /> Run Workflow
            </>
          )}
        </Button>
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
