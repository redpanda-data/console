# Role Bindings

<p align="center">
<b>:loudspeaker: This page documents Kowl Business exclusive features.</b>
</p>

## Role Bindings

A role binding grants the permissions defined in a [role](#roles) to a user or set of users. It holds a list of subjects (users or groups) and a reference to the role being granted. Optionally you can add metadata (key-value pairs) which may help you to manage your role bindings.

Example:

```yaml
# Role Bindings are used to attach roles to single users or groups of users
roleBindings:
  - metadata:
      # Metadata properties will be shown in the UI. You can omit it if you want to
      name: Developers
      creator: John Doe
    subjects:
      # You can specify all groups or users from different providers here which shall be bound to the same role
      - kind: group
        provider: Google
        name: dev-team-cloudhut@yourcompany.com
    roleName: developer
```

This role binding binds all Google accounts which are a member of `dev-team-cloudhut@yourcompany.com` to the role named `developer`. You can find a reference config for role bindings [here](https://github.com/cloudhut/kowl/blob/master/docs/config/kowl-business-role-bindings.yaml).

> :triangular_flag_on_post: In order to use groups for role bindings you need configure the [RBAC Sync on Groups](#https://github.com/cloudhut/kowl/wiki/RBAC-Sync-on-Groups).

> :triangular_flag_on_post: Users which have multiple roles assigned through role bindings will inherit the union of these roles' permissions.

### Subjects

#### Kinds

Supported kinds are: `group` and `user`. In the future there might be a third kind `serviceAccount`.

#### Providers

Supported providers are: `Google` and `GitHub`.

#### Name

Depending on your `kind` and `provider` the `name` property may refer to different things. This is an overview to what it refers for every possible case:

| Kind | Provider | Name Reference |
|---|---|---|
| `user` | Google | Google E-Mail address
| `user` | GitHub | Login handle / GitHub username
| `group` | Google | Google Group Name (which is an E-Mail address)
| `group` | GitHub | GitHub team name within your GitHub organization