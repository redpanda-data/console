/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import { UserInformationCard } from 'components/pages/roles/user-information-card';

/**
 * The Edit password button in UserInformationCard is shown whenever
 * onEditPassword is provided. The serverless and admin API guards
 * have been removed — the button should always appear when the
 * callback is passed.
 */
describe('password change button visibility', () => {
  it('shows the Edit password button when onEditPassword is provided', () => {
    render(<UserInformationCard onEditPassword={vi.fn()} username="test-user" />);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('hides the Edit password button when onEditPassword is not provided', () => {
    render(<UserInformationCard username="test-user" />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
