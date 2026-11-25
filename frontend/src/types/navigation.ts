import type { LucideIcon } from 'lucide-react';
import type { JSX, SVGProps } from 'react';

/** Icon components shared by Console navigation and the embedded host callback. */
export type SidebarIconComponent = LucideIcon | ((props: SVGProps<SVGSVGElement>) => JSX.Element);
