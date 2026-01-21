---
title: No UI Rendering Tests
impact: MEDIUM
impactDescription: UI component rendering is tested in the UI registry, not in feature code
tags: ui, rendering, registry
---

## No UI Rendering Tests

**Impact:** MEDIUM - UI component rendering is tested in the UI registry, not in feature code

UI components in `src/components/redpanda-ui/` have their own tests. Don't duplicate these tests in feature code. Focus integration tests on business logic and API calls.

**Incorrect:**
```tsx
// UserCard.test.tsx - WRONG: testing visual rendering
import { render, screen } from 'test-utils';
import { UserCard } from './UserCard';

test('displays user avatar', () => {
  render(<UserCard user={mockUser} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', mockUser.avatar);
});

test('applies correct styling for admin role', () => {
  render(<UserCard user={{ ...mockUser, role: 'admin' }} />);
  expect(screen.getByTestId('badge')).toHaveClass('bg-red-500');
});
```

**Correct:**
```tsx
// UserCard.test.tsx - CORRECT: testing business logic only
import { render, waitFor, fireEvent } from 'test-utils';
import { createRouterTransport } from '@connectrpc/connect';
import { UserCard } from './UserCard';

describe('UserCard', () => {
  it('calls delete API when delete button clicked', async () => {
    const mockDelete = vi.fn(() => Promise.resolve({}));
    const transport = createRouterTransport(({ rpc }) => {
      rpc(deleteUser, mockDelete);
    });

    const { getByRole } = render(
      <UserCard user={mockUser} />,
      { transport }
    );

    fireEvent.click(getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith({ id: mockUser.id });
    });
  });

  it('shows confirmation dialog before deletion', async () => {
    const { getByRole, findByText } = render(<UserCard user={mockUser} />);

    fireEvent.click(getByRole('button', { name: /delete/i }));

    expect(await findByText(/are you sure/i)).toBeInTheDocument();
  });
});
```

## What to Test vs What Not to Test

| Test | Don't Test |
|------|------------|
| API calls triggered by interactions | CSS classes, colors, sizes |
| Form validation on submit | Component layout |
| Error states from API failures | Icon rendering |
| Loading states during fetch | Typography styles |
| Business logic decisions | Animation effects |
