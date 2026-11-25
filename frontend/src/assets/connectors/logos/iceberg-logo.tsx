import type { SVGProps } from 'react';

import { cn } from '../../../components/redpanda-ui/lib/utils';
import IcebergMark from '../iceberg.png';

// Preserve the raster brand mark while honoring the SVG logo map's sizing contract.
export const IcebergLogo = ({ className, width = 600, height, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    aria-label="Apache Iceberg"
    className={cn('max-w-full', height === undefined && 'h-auto', className)}
    height={height ?? 600}
    role="img"
    viewBox="0 0 600 600"
    width={width}
    {...props}
  >
    <title>Apache Iceberg</title>
    <image height="600" href={IcebergMark} preserveAspectRatio="xMidYMid meet" width="600" />
  </svg>
);
