import { Box, Heading, Link, Text, VStack } from '@redpanda-data/ui';
import { withForm } from 'components/form/form';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { Link as ReactRouterLink } from 'react-router-dom';
import { createAgentHttpFormOpts } from './create-agent-http-schema';

export const AgentDetailsForm = withForm({
  ...createAgentHttpFormOpts,
  props: {
    title: 'Create AI agent',
    description: 'Description of agent ...',
  },
  render: ({ title, description, form }) => {
    const { data: secretList } = useListSecretsQuery();
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    const { data: legacyTopicList } = useLegacyListTopicsQuery();
    const legacyTopicListOptions =
      legacyTopicList?.topics?.map((topic) => ({
        value: topic?.name,
        label: topic?.name,
      })) ?? [];

    return (
      <>
        <Box>
          <Heading size="lg" mb={2}>
            {title}
          </Heading>
          <Text color="gray.600">{description}</Text>
        </Box>
        <VStack spacing={4} align="stretch">
          <form.AppField name="name">
            {(field) => <field.TextField label="Name" placeholder="Enter agent name" />}
          </form.AppField>
          <form.AppField name="description">
            {(field) => <field.TextField label="Description" placeholder="Enter agent description" />}
          </form.AppField>
          <form.AppField name="TOPIC">
            {(field) => (
              <field.SingleSelectField
                label="Source topic"
                helperText={
                  <Text>
                    Topic that ... All topics can be found under{' '}
                    <Link as={ReactRouterLink} to="/topics" target="_blank" rel="noopener noreferrer">
                      Topics tab
                    </Link>
                  </Text>
                }
                options={legacyTopicListOptions}
              />
            )}
          </form.AppField>
          <form.AppField name="OPENAI_KEY">
            {(field) => (
              <field.SingleSelectField
                label="OpenAI API credential"
                helperText={
                  <Text>
                    Credentials for OpenAI to ... All credentials are securely stored in{' '}
                    <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                      Secret Store
                    </Link>
                  </Text>
                }
                options={secretListOptions}
              />
            )}
          </form.AppField>
          <form.AppField name="POSTGRES_DSN">
            {(field) => (
              <field.SingleSelectField
                label="Postgres Connection URI"
                helperText={
                  <Text>
                    Credentials for the Postgres database that ... All credentials are securely stored in{' '}
                    <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                      Secret Store
                    </Link>
                  </Text>
                }
                options={secretListOptions}
              />
            )}
          </form.AppField>
        </VStack>
      </>
    );
  },
});
