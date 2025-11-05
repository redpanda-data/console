import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';

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
  return Component ? <Component className={className} style={style} /> : null;
};
