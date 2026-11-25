import { getComponentLogo } from 'assets/connectors/component-logo-map';
import { cn } from 'components/redpanda-ui/lib/utils';

type LogoComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export const ConnectorLogo = ({
  name,
  className,
  style,
  fallback,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: LogoComponent;
}) => {
  const Component = getComponentLogo(name) ?? fallback;
  if (!Component) {
    return null;
  }
  // Sized wrapper + inner SVG that fills it. Lets `preserveAspectRatio` (SVG
  // default) letterbox taller-than-wide logos so they can't blow out row height.
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={style}>
      <Component className="block size-full max-h-full max-w-full" />
    </span>
  );
};
