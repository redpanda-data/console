import type { JSX } from 'react';

export function SmallStat(p: { title: JSX.Element | string; children: JSX.Element | number | string }) {
  return (
    <div className="flex gap-2 text-foreground">
      <span className="font-medium">{p.title}: </span>
      {p.children}
    </div>
  );
}
