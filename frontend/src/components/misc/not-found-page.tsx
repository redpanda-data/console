import { Center, Heading, Image, Stack, Text } from '@redpanda-data/ui';
import { useHistory } from 'react-router-dom';
import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';

export const NotFoundPage = () => {
  const history = useHistory();

  return (
    <Center h="80vh" data-testid="not-found-page">
      <Stack spacing={4} textAlign="center">
        <Image src={errorBananaSlip} alt="Error" height="180px" />
        <Heading as="h1" variant="lg" fontSize={32}>
          Resource not found.
        </Heading>
        <Text
          textDecoration="underline"
          fontSize={16}
          onClick={() => {
            history.goBack();
          }}
          data-testid="return-to-home"
        >
          Go back
        </Text>
      </Stack>
    </Center>
  );
};
