import { LoadingAnimation } from './loading-animation';
import type { SharedProps } from '../lib/utils';
import artwork from './waiting-redpanda/artwork.json' with { type: 'json' };

const WaitingRedpandaSVG = ({ progress }: { progress?: number | undefined }) => {
  const progressPercentage = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));

  return (
    <svg fill="none" height="123" viewBox="0 0 341 123" width="341" xmlns="http://www.w3.org/2000/svg">
      <title>Loading Redpanda</title>
      <defs>
        <clipPath id="loading-clip">
          <rect fill="none" height="17" rx="8.5" width="339" x="1" y="52.6934" />
        </clipPath>
      </defs>
      {artwork.behindTrack.map(({ d, fill }) => (
        <path clipRule="evenodd" d={d} fill={fill} fillRule="evenodd" key={d} />
      ))}
      {/* The progress track is UI rather than artwork, so it reads from tokens. */}
      <rect className="fill-surface-subtle" height="17" rx="8.5" strokeWidth="0" width="339" x="1" y="52.6934" />
      <rect
        className="fill-brand"
        clipPath="url(#loading-clip)"
        height="17"
        rx="8.5"
        strokeWidth="0"
        width="50%"
        x={progressPercentage === undefined ? '-50%' : `${progressPercentage - 50}%`}
        y="52.6934"
      >
        {progress === undefined && (
          <animate attributeName="x" dur="4s" from="-50%" repeatCount="indefinite" to="100%" />
        )}
      </rect>
      <rect
        className="stroke-foreground"
        fill="none"
        height="17"
        rx="8.5"
        strokeWidth="2"
        width="339"
        x="1"
        y="52.6934"
      />
      {artwork.inFrontOfTrack.map(({ d, fill }) => (
        <path clipRule="evenodd" d={d} fill={fill} fillRule="evenodd" key={d} />
      ))}
    </svg>
  );
};

export interface WaitingRedpandaProps extends SharedProps {
  progress?: number | undefined;
}

export const WaitingRedpanda = ({ progress, testId }: WaitingRedpandaProps = {}) => (
  <LoadingAnimation centered className="size-full" progress={progress} responsive testId={testId} type="svg">
    <WaitingRedpandaSVG progress={progress} />
  </LoadingAnimation>
);
