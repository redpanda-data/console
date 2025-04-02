import { Heading, Stack, Text } from '@redpanda-data/ui';
import { withForm } from 'components/form/form';
import { useListAgentsQuery } from 'react-query/api/agent';
import {
  AGENT_DESCRIPTION_DESCRIPTION,
  AGENT_NAME_DESCRIPTION,
  createAgentHttpFormOpts,
} from './create-agent-http-schema';

export const AgentDetailsForm = withForm({
  ...createAgentHttpFormOpts(),
  props: {
    title: 'New Support Agent',
    description:
      "This agent connects to a GitHub repository and ingests all text-based content (e.g., Markdown, plaintext, code) into a vector database you provide. The content becomes part of a Retrieval-Augmented Generation (RAG) pipeline that enhances the agent's ability to respond accurately and contextually via a chat API.",
  },
  render: ({ title, description, form }) => {
    const { data: agentList } = useListAgentsQuery();

    return (
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Heading size="lg">{title}</Heading>
          <Text color="gray.600">{description}</Text>
        </Stack>
        <Stack spacing={4} align="stretch">
          <form.AppField
            name="name"
            validators={{
              onChange: ({ value }) =>
                agentList?.agents?.some((agent) => agent?.displayName === value)
                  ? { message: 'Agent name is already in use', path: 'name' }
                  : undefined,
            }}
          >
            {(field) => (
              <field.TextField label="Agent Name" placeholder="Enter agent name" helperText={AGENT_NAME_DESCRIPTION} />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.TextField
                label="Agent Description"
                placeholder="Enter agent description"
                helperText={AGENT_DESCRIPTION_DESCRIPTION}
              />
            )}
          </form.AppField>
        </Stack>
      </Stack>
    );
  },
});
