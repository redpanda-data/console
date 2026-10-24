import type { ReactNode } from 'react';

import { TableCell, TableRow } from '../../../redpanda-ui/components/table';

/** Full-width row holding a table row's expanded details. */
export const ExpandedDetailRow = ({ colSpan, children }: { colSpan: number; children: ReactNode }) => (
  <TableRow>
    <TableCell colSpan={colSpan}>{children}</TableCell>
  </TableRow>
);
