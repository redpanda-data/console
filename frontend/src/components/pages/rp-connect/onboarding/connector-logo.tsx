import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { cn } from 'components/redpanda-ui/lib/utils';

type LogoComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export const ConnectorLogo = ({
  name,
  className,
  style,
  fallback,
}: {
  name: ComponentName;
  className?: string;
  style?: React.CSSProperties;
  fallback?: LogoComponent;
}) => {
  const Component = (componentLogoMap[name] as LogoComponent | undefined) ?? fallback;
  if (!Component) {
    return null;
  }
  // Sized wrapper + inner SVG that fills it. Lets `preserveAspectRatio` (SVG
  // default) letterbox taller-than-wide logos so they can't blow out row height.
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={style}>
      <Component className="block h-full max-h-full w-full max-w-full" />
    </span>
  );
};
