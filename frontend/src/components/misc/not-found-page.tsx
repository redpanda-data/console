import { Center, Heading, Image, Stack } from '@redpanda-data/ui';
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
      <Center data-testid="not-found-page" h="80vh">
        <Stack spacing={4} textAlign="center">
          <Image alt="" height="180px" src={rocketPanda} />
          <Heading as="h1" fontSize={32} variant="lg">
            This feature has moved
          </Heading>
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
        </Stack>
      </Center>
    );
  }

  return (
    <Center data-testid="not-found-page" h="80vh">
      <Stack spacing={4} textAlign="center">
        <Image alt="Error" height="180px" src={errorBananaSlip} />
        <Heading as="h1" fontSize={32} variant="lg">
          Resource not found.
        </Heading>
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
      </Stack>
    </Center>
  );
};
