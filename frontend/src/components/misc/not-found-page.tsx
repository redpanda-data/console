import { Center, Heading, Image, Stack, Text } from '@redpanda-data/ui';
import { useNavigate } from 'react-router-dom';

import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <Center data-testid="not-found-page" h="80vh">
      <Stack spacing={4} textAlign="center">
        <Image alt="Error" height="180px" src={errorBananaSlip} />
        <Heading as="h1" fontSize={32} variant="lg">
          Resource not found.
        </Heading>
        <Text
          data-testid="return-to-home"
          fontSize={16}
          onClick={() => {
            navigate(-1);
          }}
          textDecoration="underline"
        >
          Go back
        </Text>
      </Stack>
    </Center>
  );
};
