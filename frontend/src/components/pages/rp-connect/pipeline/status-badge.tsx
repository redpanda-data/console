import { Badge } from 'components/redpanda-ui/components/badge';
import { AlertCircle, Check, Loader2, Pause } from 'lucide-react';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo } from 'react';

export const PipelineStatusBadge = ({ state }: { state?: Pipeline_State }) => {
  const statusConfig = useMemo(() => {
    switch (state) {
      case Pipeline_State.RUNNING:
        return {
          variant: 'green' as const,
          icon: <Check className="h-3 w-3" />,
          text: 'Running',
        };
      case Pipeline_State.STARTING:
        return {
          variant: 'blue' as const,
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Starting',
        };
      case Pipeline_State.STOPPING:
        return {
          variant: 'orange' as const,
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Stopping',
        };
      case Pipeline_State.STOPPED:
        return {
          variant: 'gray' as const,
          icon: <Pause className="h-3 w-3" />,
          text: 'Stopped',
        };
      case Pipeline_State.COMPLETED:
        return {
          variant: 'green' as const,
          icon: <Check className="h-3 w-3" />,
          text: 'Completed',
        };
      case Pipeline_State.ERROR:
        return {
          variant: 'red' as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
        };
      default:
        return {
          variant: 'gray' as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Unknown',
        };
    }
  }, [state]);

  return (
    <Badge icon={statusConfig.icon} variant={statusConfig.variant}>
      {statusConfig.text}
    </Badge>
  );
};
