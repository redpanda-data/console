import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { Badge } from 'components/redpanda-ui/components/badge';
import { ChoiceboxItem } from 'components/redpanda-ui/components/choicebox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckIcon, Waypoints } from 'lucide-react';
import { AnimatePresence, type MotionProps, motion } from 'motion/react';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { ConnectorLogo } from './connector-logo';
import type { ConnectComponentSpec } from '../types/schema';
import { componentStatusToString } from '../utils/schema';

const logoStyle = {
  height: '24px',
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
      className={cn('relative h-[78px]')}
      key={uniqueKey}
      onClick={onChange}
      value={component.name}
    >
      {/* padding right to compensate for the absolute position of the logo */}
      <div className="relative flex h-full w-full items-center gap-2 pr-8">
        <div className="flex flex-col gap-1">
          <InlineCode className="truncate bg-background px-0 py-0 font-semibold text-md">{component.name}</InlineCode>
          <span>
            {component.status && component.status !== ComponentStatus.STABLE && component.name !== 'redpanda' && (
              <Badge size="sm" variant="gray">
                {componentStatusToString(component.status)}
              </Badge>
            )}
          </span>
        </div>
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
  return component.summary ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <Text className="line-clamp-4 text-wrap" variant="small">
            {component.summary}
          </Text>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    content
  );
};
