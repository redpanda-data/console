# Common Form Patterns

This document provides patterns for common form scenarios using Field components.

## Dynamic Fields

Forms with conditionally rendered fields based on user input.

```tsx
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldError
} from "components/redpanda-ui/components/field";
import { Select } from "components/redpanda-ui/components/select";
import { Input } from "components/redpanda-ui/components/input";

const schema = z.object({
  authType: z.enum(["none", "basic", "token"]),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
}).refine((data) => {
  if (data.authType === "basic") {
    return !!data.username && !!data.password;
  }
  if (data.authType === "token") {
    return !!data.token;
  }
  return true;
}, {
  message: "Authentication fields are required",
});

export const AuthForm = () => {
  const { register, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const authType = useWatch({ control, name: "authType" });

  return (
    <FieldSet>
      <FieldLegend>Authentication</FieldLegend>
      <FieldGroup>
        <Field data-invalid={!!errors.authType}>
          <FieldLabel htmlFor="authType">Authentication Type</FieldLabel>
          <Select id="authType" {...register("authType")}>
            <option value="none">None</option>
            <option value="basic">Basic Auth</option>
            <option value="token">Token</option>
          </Select>
          {errors.authType && <FieldError>{errors.authType.message}</FieldError>}
        </Field>

        {authType === "basic" && (
          <>
            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input id="username" {...register("username")} aria-invalid={!!errors.username} />
              {errors.username && <FieldError>{errors.username.message}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input id="password" type="password" {...register("password")} aria-invalid={!!errors.password} />
              {errors.password && <FieldError>{errors.password.message}</FieldError>}
            </Field>
          </>
        )}

        {authType === "token" && (
          <Field data-invalid={!!errors.token}>
            <FieldLabel htmlFor="token">API Token</FieldLabel>
            <Input id="token" {...register("token")} aria-invalid={!!errors.token} />
            {errors.token && <FieldError>{errors.token.message}</FieldError>}
          </Field>
        )}
      </FieldGroup>
    </FieldSet>
  );
};
```

## Field Arrays (Repeatable Fields)

Forms with dynamically added/removed field groups.

```tsx
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
  FieldSeparator
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";
import { Button } from "components/redpanda-ui/components/button";

const schema = z.object({
  tags: z.array(z.object({
    key: z.string().min(1, "Key is required"),
    value: z.string().min(1, "Value is required"),
  })).min(1, "At least one tag is required"),
});

export const TagsForm = () => {
  const { register, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      tags: [{ key: "", value: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tags",
  });

  return (
    <FieldSet>
      <FieldLegend>Tags</FieldLegend>
      <FieldGroup>
        {fields.map((field, index) => (
          <div key={field.id}>
            {index > 0 && <FieldSeparator />}
            <FieldGroup>
              <Field data-invalid={!!errors.tags?.[index]?.key}>
                <FieldLabel htmlFor={`tags.${index}.key`}>Key</FieldLabel>
                <Input
                  id={`tags.${index}.key`}
                  {...register(`tags.${index}.key`)}
                  aria-invalid={!!errors.tags?.[index]?.key}
                />
                {errors.tags?.[index]?.key && (
                  <FieldError>{errors.tags[index].key.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.tags?.[index]?.value}>
                <FieldLabel htmlFor={`tags.${index}.value`}>Value</FieldLabel>
                <Input
                  id={`tags.${index}.value`}
                  {...register(`tags.${index}.value`)}
                  aria-invalid={!!errors.tags?.[index]?.value}
                />
                {errors.tags?.[index]?.value && (
                  <FieldError>{errors.tags[index].value.message}</FieldError>
                )}
              </Field>

              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => remove(index)}
                >
                  Remove Tag
                </Button>
              )}
            </FieldGroup>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          onClick={() => append({ key: "", value: "" })}
        >
          Add Tag
        </Button>
      </FieldGroup>
    </FieldSet>
  );
};
```

## Multi-Section Forms

Forms organized into multiple logical sections.

```tsx
import {
  FieldSet,
  FieldLegend,
  FieldDescription,
  FieldGroup,
  Field,
  FieldLabel,
  FieldSeparator,
  FieldError
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";
import { Textarea } from "components/redpanda-ui/components/textarea";
import { Switch } from "components/redpanda-ui/components/switch";

export const ProfileSettingsForm = () => {
  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form>
      {/* Personal Information Section */}
      <FieldSet>
        <FieldLegend>Personal Information</FieldLegend>
        <FieldDescription>
          This information will be displayed on your public profile.
        </FieldDescription>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Full Name</FieldLabel>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          <Field data-invalid={!!errors.bio}>
            <FieldLabel htmlFor="bio">Bio</FieldLabel>
            <Textarea id="bio" {...register("bio")} aria-invalid={!!errors.bio} />
            {errors.bio && <FieldError>{errors.bio.message}</FieldError>}
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSeparator />

      {/* Notification Preferences Section */}
      <FieldSet>
        <FieldLegend>Notification Preferences</FieldLegend>
        <FieldDescription>
          Manage how you receive notifications.
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="emailNotifications" {...register("emailNotifications")} />
            <FieldContent>
              <FieldLabel htmlFor="emailNotifications">Email Notifications</FieldLabel>
              <FieldDescription>Receive notifications via email</FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="horizontal">
            <Switch id="pushNotifications" {...register("pushNotifications")} />
            <FieldContent>
              <FieldLabel htmlFor="pushNotifications">Push Notifications</FieldLabel>
              <FieldDescription>Receive push notifications in browser</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
};
```

## Read-Only Fields

Display form fields in a read-only state.

```tsx
import {
  Field,
  FieldLabel,
  FieldDescription
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";

export const ServerDetailsForm = ({ server }) => {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="id">Server ID</FieldLabel>
        <Input id="id" value={server.id} disabled />
        <FieldDescription>Auto-generated unique identifier</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="createdAt">Created At</FieldLabel>
        <Input id="createdAt" value={server.createdAt} disabled />
      </Field>
    </FieldGroup>
  );
};
```

## Inline Form Actions

Forms with actions positioned within the field group.

```tsx
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldError
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";
import { Button } from "components/redpanda-ui/components/button";

export const InlineEditForm = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldSet>
        <FieldLegend>Quick Edit</FieldLegend>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="name"
                {...register("name")}
                aria-invalid={!!errors.name}
                className="flex-1"
              />
              <Button type="submit" disabled={isSubmitting}>
                Save
              </Button>
            </div>
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
};
```

## Common Pitfalls

### Pitfall 1: Missing htmlFor/id Association

❌ **Wrong:**
```tsx
<Field>
  <FieldLabel>Email</FieldLabel>
  <Input name="email" />
</Field>
```

✅ **Correct:**
```tsx
<Field>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" name="email" />
</Field>
```

### Pitfall 2: Missing aria-invalid

❌ **Wrong:**
```tsx
<Field data-invalid={!!errors.email}>
  <Input {...register("email")} />
</Field>
```

✅ **Correct:**
```tsx
<Field data-invalid={!!errors.email}>
  <Input {...register("email")} aria-invalid={!!errors.email} />
</Field>
```

### Pitfall 3: Conditional FieldError Without Check

❌ **Wrong:**
```tsx
<FieldError>{errors.email.message}</FieldError>
```

✅ **Correct:**
```tsx
{errors.email && <FieldError>{errors.email.message}</FieldError>}
```

### Pitfall 4: Using Legacy Form Components

❌ **Wrong:**
```tsx
import { Form } from "components/redpanda-ui/components/form";
import { Form } from "@redpanda-data/ui";
```

✅ **Correct:**
```tsx
import { Field, FieldLabel } from "components/redpanda-ui/components/field";
```

### Pitfall 5: Forgetting FieldContent for Horizontal Fields

❌ **Wrong:**
```tsx
<Field orientation="horizontal">
  <Switch id="notifications" />
  <FieldLabel htmlFor="notifications">Enable</FieldLabel>
  <FieldDescription>Receive updates</FieldDescription>
</Field>
```

✅ **Correct:**
```tsx
<Field orientation="horizontal">
  <Switch id="notifications" />
  <FieldContent>
    <FieldLabel htmlFor="notifications">Enable</FieldLabel>
    <FieldDescription>Receive updates</FieldDescription>
  </FieldContent>
</Field>
```
