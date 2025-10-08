import { type ComponentName, componentLogoMap } from 'assets/connectors/componentLogoMap';

export const ConnectorLogo = ({ name, className }: { name: ComponentName; className?: string }) => {
  const Component = componentLogoMap[name];
  return Component ? <Component className={className} /> : null;
};
