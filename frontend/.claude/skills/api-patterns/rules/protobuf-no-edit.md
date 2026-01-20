---
title: Protobuf No Edit
impact: CRITICAL
impactDescription: Never edit files in protogen/ - they are auto-generated
tags: protobuf, generated, code-gen
---

## Protobuf No Edit

**Impact:** CRITICAL - Never edit files in protogen/ - they are auto-generated

The `/src/protogen/` directory contains auto-generated TypeScript from protobuf schemas. Any manual edits will be lost on regeneration and may cause type mismatches.

**Incorrect:**
```typescript
// WRONG: Editing generated file
// src/protogen/user_pb.ts
export interface User {
  id: string;
  name: string;
  customField: string; // WRONG: Manual addition
}
```

**Correct:**
```typescript
// CORRECT: Extend types outside protogen
// src/types/user.ts
import { User as ProtoUser } from "protogen/user_pb";

export interface ExtendedUser extends ProtoUser {
  customField: string;
}

// CORRECT: Transform data in hooks/utils
// src/hooks/useUser.ts
const { data } = useQuery(getUser, { id });

const extendedUser = useMemo(() => ({
  ...data,
  displayName: `${data?.firstName} ${data?.lastName}`,
}), [data]);
```

## Regenerating Protos

When proto schemas change upstream:

```bash
# From repository root (not frontend/)
task proto:generate
```

## Finding Generated Files

```
src/protogen/
├── *_pb.ts           # Message types
├── *_connect.ts      # Service definitions
└── *_connectquery.ts # Connect Query hooks
```

## Common Imports

```typescript
// Message types
import { User, CreateUserRequest } from "protogen/user_pb";

// Service methods
import { UserService } from "protogen/user_connect";

// Query hooks
import { getUser, listUsers, createUser } from "protogen/user-UserService_connectquery";
```
