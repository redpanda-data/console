import { Panel } from '@xyflow/react';
import { Route } from 'lucide-react';

import { useLayout } from '@/components/node-editor/hooks/use-layout';
import { ZoomSlider } from '@/components/node-editor/zoom-slider';
import { Button } from '@/components/redpanda-ui/button';

export function WorkflowControls() {
  const runLayout = useLayout(true);

  return (
    <>
      <ZoomSlider position="bottom-left" className="bg-card" />
      <Panel position="bottom-right" className="bg-card text-foreground rounded-md">
        <Button onClick={runLayout} variant="ghost">
          <Route />
        </Button>
      </Panel>
    </>
  );
}
