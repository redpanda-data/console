import { type ReactNode, Suspense, ViewTransition } from 'react';
import './loading-boundary.css';

/** Reveal lazy content without animating its initial fallback or cached content. */
export function LoadingBoundary({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return (
    <ViewTransition default="none" update="console-content-reveal">
      <Suspense fallback={fallback}>{children}</Suspense>
    </ViewTransition>
  );
}
