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

import { renderWithFileRoutes, screen } from 'test-utils';

import { PrincipalTypeRedpandaRole, PrincipalTypeUser, parsePrincipal } from './acl.model';
import CreateACL from './create-acl';

const noop = () => {};

describe('CreateACL - principal field composability', () => {
  describe('default principal field (no renderPrincipal)', () => {
    test('shows the principal type selector when no renderPrincipal is provided', () => {
      renderWithFileRoutes(<CreateACL edit={false} onCancel={noop} />);

      expect(screen.getByTestId('shared-principal-type-select')).toBeInTheDocument();
    });

    test('shows the principal type selector when principalType is provided without renderPrincipal', () => {
      renderWithFileRoutes(<CreateACL edit={false} onCancel={noop} principalType={PrincipalTypeUser} />);

      expect(screen.getByTestId('shared-principal-type-select')).toBeInTheDocument();
    });

    test('disables the principal type selector when edit is true', () => {
      renderWithFileRoutes(
        <CreateACL
          edit={true}
          onCancel={noop}
          principalType={PrincipalTypeUser}
          sharedConfig={{ principal: 'User:test', host: '*' }}
        />
      );

      expect(screen.getByTestId('shared-principal-type-select')).toBeDisabled();
    });
  });

  describe('custom principal field (renderPrincipal)', () => {
    test('hides the default selector and shows custom content when renderPrincipal is provided', () => {
      renderWithFileRoutes(
        <CreateACL
          edit={false}
          onCancel={noop}
          principalType={PrincipalTypeRedpandaRole}
          renderPrincipal={({ value }) => (
            <div data-testid="custom-principal-field">
              <label htmlFor="custom-principal-input">Role name</label>
              <input id="custom-principal-input" readOnly value={parsePrincipal(value).name} />
            </div>
          )}
        />
      );

      expect(screen.queryByTestId('shared-principal-type-select')).not.toBeInTheDocument();
      expect(screen.getByTestId('custom-principal-field')).toBeInTheDocument();
      expect(screen.getByText('Role name')).toBeInTheDocument();
    });

    test('passes correct value to renderPrincipal', () => {
      renderWithFileRoutes(
        <CreateACL
          edit={false}
          onCancel={noop}
          principalType={PrincipalTypeRedpandaRole}
          renderPrincipal={({ value }) => <span data-testid="principal-value">{value}</span>}
        />
      );

      expect(screen.getByTestId('principal-value')).toHaveTextContent('RedpandaRole:');
    });

    test('passes disabled=true when edit is true', () => {
      renderWithFileRoutes(
        <CreateACL
          edit={true}
          onCancel={noop}
          principalType={PrincipalTypeRedpandaRole}
          renderPrincipal={({ disabled }) => (
            <span data-testid="disabled-state">{disabled ? 'disabled' : 'enabled'}</span>
          )}
          sharedConfig={{ principal: 'RedpandaRole:admin', host: '*' }}
        />
      );

      expect(screen.getByTestId('disabled-state')).toHaveTextContent('disabled');
    });
  });
});
