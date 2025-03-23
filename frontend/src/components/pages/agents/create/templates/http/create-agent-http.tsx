import { Box, Button, ButtonGroup, Divider, Flex, Heading, Text, VStack } from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useListTopicsQuery } from 'react-query/api/topic';
import { useListUsersQuery } from 'react-query/api/user';
import { useHistory } from 'react-router-dom';
import { createAgentHttpSchema } from './create-agent-http-schema';

const SASL_MECHANISM_OPTIONS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;

export const CreateAgentHTTP = () => {
  const history = useHistory();

  const { data: topicList } = useListTopicsQuery();
  const topicListOptions =
    topicList?.topics?.map((topic) => ({
      value: topic?.name,
      label: topic?.name,
    })) ?? [];

  const { data: secretList } = useListSecretsQuery();
  const secretListOptions =
    secretList?.secrets?.map((secret) => ({
      value: secret?.id,
      label: secret?.id,
    })) ?? [];

  const { data: userList } = useListUsersQuery();
  const userListOptions =
    userList?.users?.map((user) => ({
      value: user?.name,
      label: user?.name,
    })) ?? [];

  const formOpts = formOptions({
    defaultValues: {
      name: '',
      description: '',
      sourceTopic: '',
      openaiApiCredential: '',
      postgresConnectionUri: '',
      username: '',
      password: '',
      saslMechanism: 'SCRAM-SHA-256',
    },
    validators: {
      onChange: createAgentHttpSchema,
    },
    onSubmit: async ({ value }) => {
      // In a real application, this would be an API call
      console.log('Form submitted with values:', value);
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.AppForm>
        <VStack spacing={6} align="stretch">
          {/* Title Section */}
          <Box>
            <Heading size="lg" mb={2}>
              Create AI Agent
            </Heading>
            <Text color="gray.600">Description of agent ...</Text>
          </Box>
          <VStack spacing={4} align="stretch">
            <form.AppField name="name">
              {(field) => <field.TextField label="Name" placeholder="Enter agent name" />}
            </form.AppField>
            <form.AppField name="description">
              {(field) => <field.TextField label="Description" placeholder="Enter agent description" />}
            </form.AppField>
            <form.AppField name="sourceTopic">
              {(field) => (
                <field.SingleSelectField
                  label="Source topic"
                  helperText="Topic that ... description"
                  options={topicListOptions}
                />
              )}
            </form.AppField>
            <form.AppField name="openaiApiCredential">
              {(field) => (
                <field.SingleSelectField
                  label="OpenAI API credential"
                  helperText="API credential from OpenAI to ... All credentials are securely stored in Secret Store"
                  options={secretListOptions}
                />
              )}
            </form.AppField>

            <form.AppField name="postgresConnectionUri">
              {(field) => (
                <field.SingleSelectField
                  label="Postgres Connection URI"
                  helperText="Credentials for the Postgres database that ... All credentials are securely stored in Secret Store"
                  options={secretListOptions}
                />
              )}
            </form.AppField>
          </VStack>

          <Divider my={4} />

          {/* Redpanda User and Permissions Section */}
          <Box>
            <Heading size="md" mb={1}>
              Redpanda user and permissions
            </Heading>
            <Text color="gray.600" fontSize="sm" mb={4}>
              User with permissions to .... View or create users
            </Text>

            <VStack spacing={4} align="stretch">
              <form.AppField name="username">
                {(field) => (
                  <field.SingleSelectField
                    label="Username"
                    helperText="Username for the Redpanda user ... All credentials are securely stored in Secret Store"
                    placeholder="select or create user"
                    options={userListOptions}
                  />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.SingleSelectField
                    label="Password"
                    helperText="Password for the Redpanda user ... All credentials are securely stored in Secret Store"
                    placeholder="select or create secret"
                    options={secretListOptions}
                  />
                )}
              </form.AppField>
              <form.AppField name="saslMechanism">
                {(field) => (
                  <field.RadioGroupField
                    label="SASL mechanism"
                    options={SASL_MECHANISM_OPTIONS.map((option) => ({
                      value: option,
                      label: option,
                    }))}
                  />
                )}
              </form.AppField>
            </VStack>
          </Box>

          {/* Form Footer with Create and Cancel Buttons */}
          <Flex justifyContent="flex-start" pt={6}>
            <ButtonGroup
            // isDisabled={isCreateAgentPending}
            >
              <form.SubscribeButton label="Create" variant="solid" loadingText="Creating" />
              <Button variant="link" onClick={() => history.goBack()}>
                Cancel
              </Button>
            </ButtonGroup>
          </Flex>
        </VStack>
      </form.AppForm>
    </form>
  );
};
