import { Box, Heading, Link, Text, VStack } from '@redpanda-data/ui';
import { withForm } from 'components/form/form';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { Link as ReactRouterLink } from 'react-router-dom';
import { createAgentHttpFormOpts } from './create-agent-http-schema';

const SASL_MECHANISM_OPTIONS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;

export const RedpandaUserAndPermissionsForm = withForm({
  ...createAgentHttpFormOpts,
  props: {
    title: 'Redpanda user and permissions',
  },
  render: ({ title, form }) => {
    const { data: legacyUserList } = useLegacyListUsersQuery();
    const legacyUserListOptions =
      legacyUserList?.users?.map((user) => ({
        value: user?.name,
        label: user?.name,
      })) ?? [];

    const { data: secretList } = useListSecretsQuery();
    const secretListOptions =
      secretList?.secrets?.map((secret) => ({
        value: secret?.id,
        label: secret?.id,
      })) ?? [];

    return (
      <Box>
        <Heading size="md" mb={1}>
          {title}
        </Heading>
        <Text color="gray.600" fontSize="sm" mb={4}>
          User with permissions to .... View or create users
        </Text>

        <VStack spacing={4} align="stretch">
          <form.AppField name="USERNAME">
            {(field) => (
              <field.SingleSelectField
                label="Username"
                helperText={
                  <Text>
                    Username for the Redpanda user ... All users can be found under{' '}
                    <Link as={ReactRouterLink} to="/security/users" target="_blank" rel="noopener noreferrer">
                      Security tab
                    </Link>
                  </Text>
                }
                options={legacyUserListOptions}
              />
            )}
          </form.AppField>
          <form.AppField name="KAFKA_PASSWORD">
            {(field) => (
              <field.SingleSelectField
                label="Password"
                helperText={
                  <Text>
                    Password for the Redpanda user ... All credentials are securely stored in{' '}
                    <Link as={ReactRouterLink} to="/secrets" target="_blank" rel="noopener noreferrer">
                      Secret Store
                    </Link>
                  </Text>
                }
                placeholder="select or create secret"
                options={secretListOptions}
              />
            )}
          </form.AppField>
          <form.AppField name="SASL_MECHANISM">
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
    );
  },
});
