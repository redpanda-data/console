import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';

export const ConnectorLogo = ({ name, className }: { name: ComponentName; className?: string }) => {
  const Component = componentLogoMap[name];
  return Component ? <Component className={className} /> : null;
};
