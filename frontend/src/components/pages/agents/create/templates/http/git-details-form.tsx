import { Box, Heading, Text, VStack } from '@redpanda-data/ui';
import { withForm } from 'components/form/form';
import { createAgentHttpFormOpts } from './create-agent-http-schema';

export const GitDetailsForm = withForm({
  ...createAgentHttpFormOpts,
  props: {
    title: 'Git information',
    description: 'Enter the Git repository URL and branch to use for the agent',
  },
  render: ({ title, description, form }) => (
    <>
      <Box>
        <Heading size="md" mb={1}>
          {title}
        </Heading>
        <Text color="gray.500" fontSize="sm">
          {description}
        </Text>
      </Box>
      <VStack spacing={4} align="stretch">
        <form.AppField name="REPOSITORY_URL">
          {(field) => <field.TextField label="Repository URL" placeholder="Enter repository URL" />}
        </form.AppField>
        <form.AppField name="REPOSITORY_BRANCH">
          {(field) => <field.TextField label="Repository branch" placeholder="Enter repository branch" />}
        </form.AppField>
        <form.AppField name="GLOB_PATTERN">
          {(field) => <field.TextField label="Glob pattern" placeholder="Enter glob pattern" />}
        </form.AppField>
      </VStack>
    </>
  ),
});
