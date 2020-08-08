# Authentication

<p align="center">
<b>:loudspeaker: This page documents Kowl Business exclusive features.</b>
</p>

Kowl Business provides authentication via OAuth using Google or GitHub (more providers and schemes will be added in the future). You can use one or more login providers for Kowl. In order to enable OAuth authentication you must create an OAuth application for your organization first. This page guides you through the setup process.

> :triangular_flag_on_post: Some authentication integrations also allow syncing user permissions based on groups, which are managed within the login provider's ecosystem (e. g. GitHub teams). See [RBAC Sync on Groups](../authorization/groups-sync.md) for more details.

## Google

Before configuring Kowl you must create an OAuth application in Google. If you are unsure how to do this, we've created a [guide](../provider-setup/google.md) for you.

### Configure Google OAuth

In your YAML config you can configure the OAuth access like this. Only users who have at least one permission (defined in RoleBindings) will be able to login.

```yaml
login:
  # jwtSecret can be any random password, but it must be the same across all replicas you run. It is used to sign JWTs
  # which are used for user sessions. If you change the JWT secret all users will need to login again.
  jwtSecret: # This can be set via the --login.jwt-secret flag as well
  google:
    enabled: true
    clientId:
    clientSecret: # This can be set via the --login.google.client-secret flag as well
```

## GitHub

Before configuring Kowl you must create an OAuth application at GitHub.

### Configure GitHub OAuth

In your YAML config you can configure the OAuth access like this. Only users who have at least one permission (defined in RoleBindings) will be able to login.

```yaml
login:
  # jwtSecret can be any random password, but it must be the same across all replicas you run. It is used to sign JWTs
  # which are used for user sessions. If you change the JWT secret all users will need to login again.
  jwtSecret: # This can be set via the --login.jwt-secret flag as well
  github:
    enabled: true
    clientId:
    clientSecret: # This can be set via the --login.github.client-secret flag as well
```