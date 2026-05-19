import type React from 'react';

import IcebergMark from '../iceberg.png';

/**
 * Apache Iceberg brand mark. Renders the bundled raster asset
 * (`assets/connectors/iceberg.png`) so the icon is pixel-identical to the
 * official logo at the sizes the gallery uses. Accepts the same
 * `className` / `style` shape as the inline-SVG logos so it drops into
 * `componentLogoMap` unchanged.
 *
 * A true vector version would need either Apache Iceberg's official SVG
 * brand-kit asset (paste path data here and swap the implementation), or
 * a raster-tracer pass (`potrace` / `vtracer`) on the PNG.
 */
export const IcebergLogo = ({ className, style, ...props }: Omit<React.SVGProps<SVGSVGElement>, 'children'>) => (
  <img
    alt="Apache Iceberg"
    className={className}
    src={IcebergMark}
    style={{ objectFit: 'contain', ...(style as React.CSSProperties) }}
    {...(props as unknown as React.ImgHTMLAttributes<HTMLImageElement>)}
  />
);
