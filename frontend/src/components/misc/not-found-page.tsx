import { Center, Heading, Image, Stack, Text } from '@redpanda-data/ui';
import { useNavigate } from 'react-router-dom';
import errorBananaSlip from '../../assets/redpanda/ErrorBananaSlip.svg';

export const NotFoundPage = () => {
  const navigate = useNavigate();

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
            navigate(-1);
          }}
          data-testid="return-to-home"
        >
          Go back
        </Text>
      </Stack>
    </Center>
  );
};
