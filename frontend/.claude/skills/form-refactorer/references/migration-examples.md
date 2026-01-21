# Form Migration Examples

This document shows concrete before/after examples of migrating from legacy form patterns to modern Field components.

## Example 1: Simple Form with Validation

### Before (Legacy - Chakra UI)

```tsx
import { FormControl, FormLabel, Input, FormErrorMessage } from "@chakra-ui/react";
import { useForm } from "react-hook-form";

export const CreateServerForm = () => {
  const { register, formState: { errors } } = useForm();

  return (
    <form>
      <FormControl isInvalid={!!errors.name}>
        <FormLabel>Server Name</FormLabel>
        <Input {...register("name")} />
        <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!errors.url}>
        <FormLabel>Server URL</FormLabel>
        <Input {...register("url")} />
        <FormErrorMessage>{errors.url?.message}</FormErrorMessage>
      </FormControl>
    </form>
  );
};
```

### After (Modern - Field Components)

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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: z.string().url("Must be a valid URL"),
});

export const CreateServerForm = () => {
  const { register, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form>
      <FieldSet>
        <FieldLegend>Server Configuration</FieldLegend>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Server Name</FieldLabel>
            <Input
              id="name"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          <Field data-invalid={!!errors.url}>
            <FieldLabel htmlFor="url">Server URL</FieldLabel>
            <Input
              id="url"
              {...register("url")}
              aria-invalid={!!errors.url}
            />
            {errors.url && <FieldError>{errors.url.message}</FieldError>}
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
};
```

**Key Changes:**
- Replace Chakra `FormControl` → `Field`
- Replace Chakra `FormLabel` → `FieldLabel` with `htmlFor`
- Replace Chakra `FormErrorMessage` → `FieldError`
- Add `FieldSet`, `FieldLegend`, `FieldGroup` for proper structure
- Add `data-invalid` attribute to Field
- Add `aria-invalid` to Input
- Replace Yup → Zod for validation
- Import components from Redpanda UI Registry

## Example 2: Form with Descriptions

### Before (Legacy - @redpanda-data/ui)

```tsx
import { Form } from "@redpanda-data/ui";

export const SettingsForm = () => {
  return (
    <Form>
      <Form.Field label="Email" helperText="We'll never share your email">
        <Input name="email" />
      </Form.Field>
    </Form>
  );
};
```

### After (Modern - Field Components)

```tsx
import {
  Field,
  FieldLabel,
  FieldDescription
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";

export const SettingsForm = () => {
  return (
    <form>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" name="email" />
        <FieldDescription>We'll never share your email.</FieldDescription>
      </Field>
    </form>
  );
};
```

**Key Changes:**
- Replace `Form` component → native `<form>`
- Replace `Form.Field` → `Field`
- Replace `label` prop → `FieldLabel` component
- Replace `helperText` prop → `FieldDescription` component
- Add `id` and `htmlFor` for accessibility

## Example 3: Horizontal Field with Switch

### Before (Legacy - Chakra UI)

```tsx
import { FormControl, FormLabel, Switch, Text } from "@chakra-ui/react";

export const NotificationSettings = () => {
  return (
    <FormControl display="flex" alignItems="center">
      <FormLabel mb="0">Enable notifications</FormLabel>
      <Switch id="notifications" />
      <Text fontSize="sm" color="gray.600">
        Receive updates via email
      </Text>
    </FormControl>
  );
};
```

### After (Modern - Field Components)

```tsx
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldDescription
} from "components/redpanda-ui/components/field";
import { Switch } from "components/redpanda-ui/components/switch";

export const NotificationSettings = () => {
  return (
    <Field orientation="horizontal">
      <Switch id="notifications" />
      <FieldContent>
        <FieldLabel htmlFor="notifications">Enable notifications</FieldLabel>
        <FieldDescription>Receive updates via email.</FieldDescription>
      </FieldContent>
    </Field>
  );
};
```

**Key Changes:**
- Replace Chakra layout props → `orientation="horizontal"` on Field
- Use `FieldContent` to group label and description
- Remove manual spacing/styling props
- Add proper `htmlFor` association

## Example 4: Complex Form with Sections

### Before (Legacy - Mixed)

```tsx
import { Box, FormControl, FormLabel, Input, Textarea } from "@chakra-ui/react";

export const ProfileForm = () => {
  return (
    <Box>
      <Box mb={6}>
        <FormControl>
          <FormLabel>Full Name</FormLabel>
          <Input name="name" />
        </FormControl>

        <FormControl mt={4}>
          <FormLabel>Email</FormLabel>
          <Input name="email" />
        </FormControl>
      </Box>

      <Box mb={6}>
        <FormControl>
          <FormLabel>Bio</FormLabel>
          <Textarea name="bio" />
        </FormControl>
      </Box>
    </Box>
  );
};
```

### After (Modern - Field Components)

```tsx
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldSeparator
} from "components/redpanda-ui/components/field";
import { Input } from "components/redpanda-ui/components/input";
import { Textarea } from "components/redpanda-ui/components/textarea";

export const ProfileForm = () => {
  return (
    <FieldSet>
      <FieldLegend>Profile Information</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Full Name</FieldLabel>
          <Input id="name" name="name" />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" />
        </Field>

        <FieldSeparator />

        <Field>
          <FieldLabel htmlFor="bio">Bio</FieldLabel>
          <Textarea id="bio" name="bio" />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
};
```

**Key Changes:**
- Replace `Box` layout containers → `FieldSet` and `FieldGroup`
- Add `FieldLegend` for semantic grouping
- Use `FieldSeparator` instead of margin/spacing props
- Remove all Chakra spacing props (mb, mt, etc.)
- Proper semantic HTML structure

## Common Migration Patterns

### Pattern 1: isInvalid → data-invalid + aria-invalid

**Before:**
```tsx
<FormControl isInvalid={!!errors.field}>
  <Input {...register("field")} />
</FormControl>
```

**After:**
```tsx
<Field data-invalid={!!errors.field}>
  <Input {...register("field")} aria-invalid={!!errors.field} />
</Field>
```

### Pattern 2: Helper Text → FieldDescription

**Before:**
```tsx
<FormControl>
  <FormLabel>Field</FormLabel>
  <Input />
  <FormHelperText>Helper text</FormHelperText>
</FormControl>
```

**After:**
```tsx
<Field>
  <FieldLabel htmlFor="field">Field</FieldLabel>
  <Input id="field" />
  <FieldDescription>Helper text</FieldDescription>
</Field>
```

### Pattern 3: Error Messages → FieldError

**Before:**
```tsx
<FormControl isInvalid={!!errors.field}>
  <FormErrorMessage>{errors.field?.message}</FormErrorMessage>
</FormControl>
```

**After:**
```tsx
<Field data-invalid={!!errors.field}>
  {errors.field && <FieldError>{errors.field.message}</FieldError>}
</Field>
```

### Pattern 4: Form Sections → FieldGroup with FieldSeparator

**Before:**
```tsx
<Box>
  <FormControl mb={4}>...</FormControl>
  <Divider my={6} />
  <FormControl>...</FormControl>
</Box>
```

**After:**
```tsx
<FieldGroup>
  <Field>...</Field>
  <FieldSeparator />
  <Field>...</Field>
</FieldGroup>
```
