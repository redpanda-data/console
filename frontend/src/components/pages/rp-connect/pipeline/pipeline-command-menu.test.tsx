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
import { describe, expect, it, rs } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import type { editor } from 'monaco-editor';
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ListTopicsResponse_TopicSchema, ListTopicsResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { ListUsersResponse_UserSchema, ListUsersResponseSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { render, screen, waitFor } from 'test-utils';

import { PipelineCommandMenu } from './pipeline-command-menu';

Element.prototype.scrollIntoView = rs.fn();

function createMockEditor() {
  return {
    getPosition: rs.fn(() => ({ lineNumber: 1, column: 1 })),
    getModel: rs.fn(() => ({
      getLineContent: rs.fn(() => ''),
      getLineMaxColumn: rs.fn(() => 1),
      getValue: rs.fn(() => ''),
    })),
    executeEdits: rs.fn(),
    setPosition: rs.fn(),
    focus: rs.fn(),
    getDomNode: rs.fn(() => null),
    getScrolledVisiblePosition: rs.fn(() => null),
    onDidScrollChange: rs.fn(() => ({ dispose: rs.fn() })),
  } as unknown as editor.IStandaloneCodeEditor;
}

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

function getHeading(name: string) {
  return screen.getByRole('heading', { name, level: 5 });
}

function queryHeading(name: string) {
  return screen.queryByRole('heading', { name, level: 5 });
}

describe('the PipelineCommandMenu', () => {
  it('dialog variant renders all category group headings', async () => {
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

  it('drops the heading of an empty category but still offers to create into it', async () => {
    const transport = createTestTransport({ topicNames: ['orders'], userNames: ['svc'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => expect(getHeading('Topics')).toBeInTheDocument());
    expect(queryHeading('Secrets')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create secret/iu })).toBeInTheDocument();
  });

  it('secret items appear in the list with correct syntax', async () => {
    const transport = createTestTransport({ secretNames: ['MY_API_KEY', 'DB_PASSWORD'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(screen.getByText('secrets.MY_API_KEY')).toBeInTheDocument();
      expect(screen.getByText('secrets.DB_PASSWORD')).toBeInTheDocument();
    });
  });

  it('selecting a contextual variable calls executeEdits and closes the menu', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport();
    const mockEditor = createMockEditor();
    const onOpenChange = rs.fn();

    render(<PipelineCommandMenu editorInstance={mockEditor} onOpenChange={onOpenChange} open variant="dialog" />, {
      transport,
    });

    expect(await screen.findByText('${REDPANDA_BROKERS}')).toBeInTheDocument();

    await user.click(screen.getByText('${REDPANDA_BROKERS}'));

    await waitFor(() => {
      expect(mockEditor.executeEdits).toHaveBeenCalledWith(
        'command-menu-insert',
        expect.arrayContaining([expect.objectContaining({ text: '${REDPANDA_BROKERS}' })])
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('category filter toggle shows only the selected category', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport({ secretNames: ['SECRET_ONE'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(getHeading('Contextual variables')).toBeInTheDocument();
      expect(getHeading('Secrets')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Secrets' }));

    await waitFor(() => {
      expect(getHeading('Secrets')).toBeInTheDocument();
      expect(queryHeading('Contextual variables')).not.toBeInTheDocument();
    });
  });

  it('popover variant renders Command component', async () => {
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

    expect(await screen.findByPlaceholderText('Filter...')).toBeInTheDocument();
  });

  it('popover selection calls onSlashSelect with variable text', async () => {
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

    await user.click(await screen.findByText('${REDPANDA_BROKERS}'));

    await waitFor(() => {
      expect(onSlashSelect).toHaveBeenCalledWith('${REDPANDA_BROKERS}');
    });
  });

  it('topic items from API appear in list', async () => {
    const transport = createTestTransport({ topicNames: ['my-topic', 'orders'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(screen.getByText('my-topic')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
    });
  });

  it('"Create secret" button opens AddSecretsDialog', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport({ secretNames: ['EXISTING_KEY'] });
    const onOpenChange = rs.fn();

    render(
      <PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={onOpenChange} open variant="dialog" />,
      {
        transport,
      }
    );

    expect(await screen.findByText('secrets.EXISTING_KEY')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Create secret/iu }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('create buttons', () => {
    it('"All" tab shows all three create buttons', async () => {
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create secret/iu })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create topic/iu })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create user/iu })).toBeInTheDocument();
      });
    });

    it('"Secrets" tab shows only "Create secret"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create secret/iu })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Secrets' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create secret/iu })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/iu })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/iu })).not.toBeInTheDocument();
      });
    });

    it('"Topics" tab shows only "Create topic"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create topic/iu })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Topics' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/iu })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create topic/iu })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/iu })).not.toBeInTheDocument();
      });
    });

    it('"Users" tab shows only "Create user"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create user/iu })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Users' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/iu })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/iu })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create user/iu })).toBeInTheDocument();
      });
    });

    it('"Variables" tab shows no create buttons', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={rs.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create secret/iu })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Variables' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/iu })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/iu })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/iu })).not.toBeInTheDocument();
      });
    });

    it('popover shows all three create buttons', async () => {
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

      await waitFor(() => {
        expect(screen.getByText('Create secret')).toBeInTheDocument();
        expect(screen.getByText('Create topic')).toBeInTheDocument();
        expect(screen.getByText('Create user')).toBeInTheDocument();
      });
    });
  });
});
