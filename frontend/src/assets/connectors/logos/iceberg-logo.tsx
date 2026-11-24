import type { CSSProperties, SVGProps } from 'react';

import IcebergMark from '../iceberg.png';

export const IcebergLogo = ({ className, style }: Pick<SVGProps<SVGSVGElement>, 'className' | 'style'>) => (
  <img
    alt="Apache Iceberg"
    className={className}
    src={IcebergMark}
    style={{ objectFit: 'contain', ...(style as CSSProperties) }}
  />
);
