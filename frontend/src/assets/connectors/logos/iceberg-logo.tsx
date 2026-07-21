import type { CSSProperties, SVGProps } from 'react';

import IcebergMark from '../iceberg.png';

// Wraps the bundled raster mark with the same prop shape as the inline-SVG
// logos so it drops into componentLogoMap unchanged. Swap for a real SVG once
// the official brand-kit vector is available.
export const IcebergLogo = ({ className, style }: Pick<SVGProps<SVGSVGElement>, 'className' | 'style'>) => (
  <img
    alt="Apache Iceberg"
    className={className}
    src={IcebergMark}
    style={{ objectFit: 'contain', ...(style as CSSProperties) }}
  />
);
