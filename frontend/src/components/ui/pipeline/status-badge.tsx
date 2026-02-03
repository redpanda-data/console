import { cva, type VariantProps } from 'class-variance-authority';
import { Badge } from 'components/redpanda-ui/components/badge';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo } from 'react';

const pulsingIconVariants = cva('rounded-full', {
  variants: {
    variant: {
      success: 'bg-background-success-strong',
      informative: 'bg-background-informative-strong',
      warning: 'bg-background-warning-strong',
      destructive: 'bg-background-destructive-strong',
      disabled: 'bg-background-informative-strong',
    },
  },
});

type PulsingStatusIconProps = VariantProps<typeof pulsingIconVariants>;

const PulsingStatusIcon = ({ variant }: PulsingStatusIconProps) => {
  return (
    <div className="relative flex items-center justify-center size-2.5">
      <div className={cn(pulsingIconVariants({ variant }), 'size-2 opacity-75', variant !== 'disabled' && 'animate-ping')} />
      <div className={cn(pulsingIconVariants({ variant }), 'absolute inset-0 size-2.5')} />
    </div>
  );
};

export const PipelineStatusBadge = ({ state }: { state?: Pipeline_State }) => {
  const statusConfig = useMemo(() => {
    switch (state) {
      case Pipeline_State.RUNNING:
        return {
          icon: <PulsingStatusIcon variant="success" />,
          text: 'Running',
        };
      case Pipeline_State.STARTING:
        return {
          icon: <PulsingStatusIcon variant="warning" />,
          text: 'Starting',
        };
      case Pipeline_State.STOPPING:
        return {
          icon: <PulsingStatusIcon variant="warning" />,
          text: 'Stopping',
        };
      case Pipeline_State.STOPPED:
        return {
          icon: <PulsingStatusIcon variant="disabled" />,
          text: 'Stopped',
        };
      case Pipeline_State.COMPLETED:
        return {
          icon: <PulsingStatusIcon variant="success" />,
          text: 'Completed',
        };
      case Pipeline_State.ERROR:
        return {
          icon: <PulsingStatusIcon variant="destructive" />,
          text: 'Error',
        };
      default:
        return {
          icon: <PulsingStatusIcon variant="informative" />,
          text: 'Unknown',
        };
    }
  }, [state]);

  return (
    <Badge icon={statusConfig.icon} variant="secondary-inverted" className="gap-2">
      {statusConfig.text}
    </Badge>
  );
};
