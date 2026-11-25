/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ListTopicsResponse_TopicSchema, ListTopicsResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { ListUsersResponse_UserSchema, ListUsersResponseSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { render, screen, waitFor } from 'test-utils';

import { PipelineCommandMenu } from './pipeline-command-menu';

// cmdk calls scrollIntoView on selected items — JSDOM does not implement it
Element.prototype.scrollIntoView = rs.fn();

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

function createMockEditor() {
  return {
    getPosition: rs.fn(() => ({ lineNumber: 1, column: 1 })),
    getModel: rs.fn(() => ({
      getLineContent: rs.fn(() => ''),
      getLineMaxColumn: rs.fn(() => 1),
      getValue: rs.fn(() => ''),
      setValue: rs.fn(),
    })),
    executeEdits: rs.fn(() => true),
    setPosition: rs.fn(),
    focus: rs.fn(),
    getDomNode: rs.fn(() => null),
    getScrolledVisiblePosition: rs.fn(() => null),
    onDidScrollChange: rs.fn(() => ({ dispose: rs.fn() })),
  };
}

// ---------------------------------------------------------------------------
// Transport factory — registers all three RPCs used by PipelineCommandMenu
// ---------------------------------------------------------------------------

function createTestTransport({
  secretNames = [] as string[],
  topicNames = [] as string[],
  userNames = [] as string[],
} = {}) {
  return createRouterTransport(({ rpc }) => {
    rpc(listSecrets, () =>
      create(ListSecretsResponseSchema, {
        response: {
          secrets: secretNames.map((id) => create(SecretSchema, { id })),
          nextPageToken: '',
        },
      })
    );

    rpc(listTopics, () =>
      create(ListTopicsResponseSchema, {
        topics: topicNames.map((name) => create(ListTopicsResponse_TopicSchema, { name })),
        nextPageToken: '',
      })
    );

    rpc(listUsers, () =>
      create(ListUsersResponseSchema, {
        users: userNames.map((name) => create(ListUsersResponse_UserSchema, { name })),
        nextPageToken: '',
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Helper: query category group headings (rendered as h5 elements)
function getHeading(name: string) {
  return screen.getByRole('heading', { name, level: 5 });
}

function queryHeading(name: string) {
  return screen.queryByRole('heading', { name, level: 5 });
}

describe('the PipelineCommandMenu', () => {
  test('dialog variant renders all category group headings', async () => {
    const transport = createTestTransport({ secretNames: ['API_KEY'], topicNames: ['orders'], userNames: ['svc'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(getHeading('Contextual variables')).toBeInTheDocument();
      expect(getHeading('Secrets')).toBeInTheDocument();
      expect(getHeading('Topics')).toBeInTheDocument();
      expect(getHeading('Users')).toBeInTheDocument();
    });
  });

  test('drops the heading of an empty category but still offers to create into it', async () => {
    const transport = createTestTransport({ topicNames: ['orders'], userNames: ['svc'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => expect(getHeading('Topics')).toBeInTheDocument());
    expect(queryHeading('Secrets')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create secret/i })).toBeInTheDocument();
  });

  test('secret items appear in the list with correct syntax', async () => {
    const transport = createTestTransport({ secretNames: ['MY_API_KEY', 'DB_PASSWORD'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(screen.getByText('secrets.MY_API_KEY')).toBeInTheDocument();
      expect(screen.getByText('secrets.DB_PASSWORD')).toBeInTheDocument();
    });
  });

  test('selecting a contextual variable calls executeEdits and closes the menu', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport();
    const mockEditor = createMockEditor();
    const onOpenChange = rs.fn();

    render(<PipelineCommandMenu editorInstance={mockEditor} onOpenChange={onOpenChange} open variant="dialog" />, {
      transport,
    });

    // Wait for contextual variables to render
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal external configuration syntax, not JavaScript interpolation.
    expect(await screen.findByText('${REDPANDA_BROKERS}')).toBeInTheDocument();

    // Click the first contextual variable item
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal external configuration syntax, not JavaScript interpolation.
    await user.click(screen.getByText('${REDPANDA_BROKERS}'));

    await waitFor(() => {
      expect(mockEditor.executeEdits).toHaveBeenCalledWith(
        'command-menu-insert',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal external configuration syntax, not JavaScript interpolation.
        expect.arrayContaining([expect.objectContaining({ text: '${REDPANDA_BROKERS}' })])
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  test('category filter toggle shows only the selected category', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport({ secretNames: ['SECRET_ONE'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    // Wait for all groups to be visible initially
    await waitFor(() => {
      expect(getHeading('Contextual variables')).toBeInTheDocument();
      expect(getHeading('Secrets')).toBeInTheDocument();
    });

    // Click the "Secrets" toggle (single-select ToggleGroupItem renders as a Base UI toggle button (aria-pressed))
    await user.click(screen.getByRole('button', { name: 'Secrets' }));

    await waitFor(() => {
      expect(getHeading('Secrets')).toBeInTheDocument();
      expect(queryHeading('Contextual variables')).not.toBeInTheDocument();
    });
  });

  test('popover variant renders Command component', async () => {
    const transport = createTestTransport();

    render(
      <PipelineCommandMenu
        editorInstance={createMockEditor()}
        onOpenChange={rs.fn()}
        onSlashSelect={rs.fn()}
        open
        slashPosition={{ lineNumber: 1, column: 1 }}
        variant="popover"
      />,
      { transport }
    );

    // The popover renders a cmdk input for filtering
    expect(await screen.findByPlaceholderText('Filter...')).toBeInTheDocument();
  });

  test('popover selection calls onSlashSelect with variable text', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport();
    const onSlashSelect = rs.fn();

    render(
      <PipelineCommandMenu
        editorInstance={createMockEditor()}
        onOpenChange={rs.fn()}
        onSlashSelect={onSlashSelect}
        open
        slashPosition={{ lineNumber: 1, column: 1 }}
        variant="popover"
      />,
      { transport }
    );

    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal external configuration syntax, not JavaScript interpolation.
    await user.click(await screen.findByText('${REDPANDA_BROKERS}'));

    await waitFor(() => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal external configuration syntax, not JavaScript interpolation.
      expect(onSlashSelect).toHaveBeenCalledWith('${REDPANDA_BROKERS}');
    });
  });

  test('topic items from API appear in list', async () => {
    const transport = createTestTransport({ topicNames: ['my-topic', 'orders'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(screen.getByText('my-topic')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
    });
  });

  test('"Create secret" button opens AddSecretsDialog', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport({ secretNames: ['EXISTING_KEY'] });
    const onOpenChange = rs.fn();

    render(
      <PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={onOpenChange} open variant="dialog" />,
      {
        transport,
      }
    );

    // Wait for secrets to load so the footer button is visible
    expect(await screen.findByText('secrets.EXISTING_KEY')).toBeInTheDocument();

    // Click the "Create secret" button in the footer
    await user.click(screen.getByRole('button', { name: /Create secret/i }));

    // openSubDialog calls onOpenChange(false) before opening the sub-dialog
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('create buttons', () => {
    test('"All" tab shows all three create buttons', async () => {
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create secret/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create topic/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
      });
    });

    test('"Secrets" tab shows only "Create secret"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create secret/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Secrets' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create secret/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });

    test('"Topics" tab shows only "Create topic"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create topic/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Topics' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create topic/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });

    test('"Users" tab shows only "Create user"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create user/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Users' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
      });
    });

    test('"Variables" tab shows no create buttons', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create secret/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Variables' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });

    test('popover shows all three create buttons', async () => {
      const transport = createTestTransport();

      render(
        <PipelineCommandMenu
          editorInstance={createMockEditor()}
          onOpenChange={rs.fn()}
          onSlashSelect={rs.fn()}
          open
          slashPosition={{ lineNumber: 1, column: 1 }}
          variant="popover"
        />,
        { transport }
      );

      // Wait for the popover content to render including footer buttons
      await waitFor(() => {
        expect(screen.getByText('Create secret')).toBeInTheDocument();
        expect(screen.getByText('Create topic')).toBeInTheDocument();
        expect(screen.getByText('Create user')).toBeInTheDocument();
      });
    });
  });
});
