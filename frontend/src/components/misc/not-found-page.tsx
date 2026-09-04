import { Link, useLocation, useRouter } from '@tanstack/react-router';

import { getLegacyAiDestination } from './legacy-ai-route';
import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';
import rocketPanda from '../../assets/redpanda/RocketPanda.svg';
import { config } from '../../config';
import { Button, buttonVariants } from '../redpanda-ui/components/button';

export const NotFoundPage = () => {
  const router = useRouter();
  const { pathname } = useLocation();
  const legacyAiDestination = getLegacyAiDestination(pathname, config.clusterId);

  if (legacyAiDestination) {
    return (
      <div className="flex h-[80vh] items-center justify-center" data-testid="not-found-page">
        <div className="flex flex-col items-center gap-4 text-center">
          <img alt="" className="h-[180px]" src={rocketPanda} />
          <h1 className="font-semibold text-heading-xl">This feature has moved</h1>
          <p className="max-w-xl text-muted-foreground">
            AI agents, MCP servers, knowledge bases, and transcripts are now available in Redpanda AI.
          </p>
          <a className={buttonVariants()} href={legacyAiDestination}>
            Open Redpanda AI
          </a>
          <Button
            onClick={() => {
              router.history.back();
            }}
            type="button"
            variant="link"
          >
            Go back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[80vh] items-center justify-center" data-testid="not-found-page">
      <div className="flex flex-col items-center gap-4 text-center">
        <img alt="Error" className="h-[180px]" src={errorBananaSlip} />
        <h1 className="font-semibold text-heading-xl">Resource not found.</h1>
        <Button
          onClick={() => {
            router.history.back();
          }}
          type="button"
          variant="link"
        >
          Go back
        </Button>
        <Link className={buttonVariants({ variant: 'link' })} to="/">
          Return home
        </Link>
      </div>
    </div>
  );
};
