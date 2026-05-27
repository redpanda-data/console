import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { cn } from 'components/redpanda-ui/lib/utils';

export const ConnectorLogo = ({
  name,
  className,
  style,
}: {
  name: ComponentName;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const Component = componentLogoMap[name];
  if (!Component) {
    return null;
  }
  // Wrap in a sized container so taller-than-wide logos (e.g. MongoDB's leaf,
  // viewBox 256×549) can't blow out the row height. The inner SVG fills the
  // wrapper and `preserveAspectRatio="xMidYMid meet"` (SVG default) letterboxes
  // the content to keep each logo's natural aspect ratio.
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={style}>
      <Component className="block h-full max-h-full w-full max-w-full" />
    </span>
  );
};
