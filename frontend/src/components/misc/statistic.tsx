import { Stat } from 'components/redpanda-ui/components/stat';
import type { ReactNode } from 'react';

// Legacy stat; the row that lays these out owns the spacing.
export function Statistic(p: { title: string; value: ReactNode; className?: string }) {
  return <Stat className={p.className} label={p.title} size="lg" value={p.value} />;
}
