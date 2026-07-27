import { Center, Heading, Image, Stack } from '@redpanda-data/ui';
import { Link, useRouter } from '@tanstack/react-router';

import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';
import { Button, buttonVariants } from '../redpanda-ui/components/button';

export const NotFoundPage = () => {
  const router = useRouter();

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
