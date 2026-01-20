---
title: Mock Transport
impact: HIGH
impactDescription: Use createRouterTransport to mock gRPC/Connect API calls
tags: mocking, api, connect, grpc
---

## Mock Transport

**Impact:** HIGH - Use createRouterTransport to mock gRPC/Connect API calls

The codebase uses Connect/gRPC-Web for API calls. Mock at the transport layer using `createRouterTransport` for realistic integration tests.

**Incorrect:**
```tsx
// WRONG: Mocking fetch or axios
vi.mock('axios');
axios.get.mockResolvedValue({ data: { users: [] } });
```

**Correct:**
```tsx
import { createRouterTransport } from '@connectrpc/connect';
import { listUsers, createUser, deleteUser } from 'protogen/user_connect';

describe('UserList', () => {
  it('fetches and displays users', async () => {
    const mockListUsers = vi.fn(() =>
      Promise.resolve({
        users: [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ],
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listUsers, mockListUsers);
    });

    const { findByText } = render(<UserList />, { transport });

    expect(await findByText('Alice')).toBeInTheDocument();
    expect(await findByText('Bob')).toBeInTheDocument();
    expect(mockListUsers).toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    const mockListUsers = vi.fn(() =>
      Promise.reject(new Error('Network error'))
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listUsers, mockListUsers);
    });

    const { findByText } = render(<UserList />, { transport });

    expect(await findByText(/error/i)).toBeInTheDocument();
  });
});
```

## Multiple RPC Methods

```tsx
const transport = createRouterTransport(({ rpc }) => {
  rpc(listUsers, () => Promise.resolve({ users: [] }));
  rpc(createUser, (req) => Promise.resolve({ id: '1', ...req }));
  rpc(deleteUser, () => Promise.resolve({}));
});
```

## Accessing Request Data

```tsx
const mockCreate = vi.fn((req) => {
  expect(req.name).toBe('Test User');
  return Promise.resolve({ id: '123', name: req.name });
});
```
