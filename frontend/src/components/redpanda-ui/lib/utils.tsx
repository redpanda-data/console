import { type ClassValue, clsx } from 'clsx';
import type React from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function wrapStringChild(
  child: React.ReactNode,
  Wrapper: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>,
  className?: string
): React.ReactNode {
  if (typeof child === 'string') {
    return <Wrapper className={className}>{child}</Wrapper>;
  }
  return child;
}

export type SharedProps = {
  testId?: string;
};
