import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import { ChoiceboxItem } from 'components/redpanda-ui/components/choicebox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckIcon, Waypoints } from 'lucide-react';
import { AnimatePresence, type MotionProps, motion } from 'motion/react';

import { ConnectorLogo } from './connector-logo';
import type { ConnectComponentSpec, ConnectComponentStatus } from '../types/schema';

const logoStyle = {
  height: '24px',
};

const getBadgeVariantForStatus = (status: ConnectComponentStatus) => {
  switch (status) {
    case 'deprecated':
      return 'red';
    case 'experimental':
      return 'orange';
    case 'beta':
      return 'amber';
    default:
      return 'default';
  }
};

const getLogoForComponent = (component: ConnectComponentSpec) => {
  if (component?.logoUrl) {
    return <img alt={component.name} src={component.logoUrl} style={logoStyle} />;
  }
  if (componentLogoMap[component.name as ComponentName]) {
    return <ConnectorLogo name={component.name as ComponentName} style={logoStyle} />;
  }
  return <Waypoints className="text-muted-foreground" style={logoStyle} />;
};

const logoMotionProps: MotionProps = {
  initial: {
    opacity: 0,
    transform: 'scale(0.8)',
  },
  animate: {
    opacity: 1,
    transform: 'scale(1)',
  },
  exit: {
    opacity: 0,
    transform: 'scale(0.8)',
  },
  transition: {
    duration: 0.2,
    ease: 'easeInOut',
  },
};

export const ConnectTile = ({
  checked,
  uniqueKey,
  component,
  onChange,
}: {
  checked: boolean;
  uniqueKey: string;
  component: ConnectComponentSpec;
  onChange: () => void;
}) => {
  const content = (
    <ChoiceboxItem
      checked={checked}
      className={cn('relative h-full')}
      key={uniqueKey}
      onClick={onChange}
      value={component.name}
    >
      {/* padding right to compensate for the absolute position of the logo */}
      <div className="relative flex w-full items-center gap-2 pr-8">
        <Text className="truncate font-medium">{component.name}</Text>
        {component.status && component.status !== 'stable' && (
          <Badge size="sm" variant={getBadgeVariantForStatus(component.status)}>
            {component.status}
          </Badge>
        )}
        <div className="-translate-y-1/2 absolute top-1/2 right-0">
          <AnimatePresence mode="wait">
            {checked ? (
              <motion.div
                {...logoMotionProps}
                className="!border-accent-foreground flex items-center justify-center rounded-full border-1"
                key="checked-logo"
              >
                <div
                  className="!border-background flex items-center justify-center rounded-full border-2 bg-accent-foreground p-1"
                  style={{
                    height: '22px',
                    width: '22px',
                  }}
                >
                  <CheckIcon className="text-background" size={16} />
                </div>
              </motion.div>
            ) : (
              <motion.div {...logoMotionProps} key="unchecked-logo">
                {getLogoForComponent(component)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ChoiceboxItem>
  );
  const description = component.summary;
  return description ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="max-w-sm text-wrap">
          <Text variant="small">{description}</Text>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    content
  );
};
