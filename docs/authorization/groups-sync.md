# Groups Sync

<p align="center">
<b>:loudspeaker: This page documents Kowl Business exclusive features.</b>
</p>

If you want to bind Roles to a set of users (e.g. GitHub teams or Google Groups) you need to grant Kowl a few additional permissions, so that it can resolve the memberships of these user sets. This page guides you through the required steps for each supported provider.

## Google

### Introduction

Google Groups is a Google service which belongs to GSuite. Businesses may use it to organize their employees in groups so that they can manage permissions on a group level. A group can be as simple as this:

```
Group: dev-team-checkout@mycompany.com
Members:
- employee.ab@mycompany.com
- employee.cd@mycompany.com
- employee.ef@mycompany.com
```

But it could also be a nested group like this:

```
Group: software-engineers@mycompany.com
Members:
- dev-team-checkout@mycompany.com (Group)
- dev-team-landing@mycompany.com (Group)
- bi-reports@other-company.com (External Group, managed within a different organization)
- security-officer@mycompany.com (User)
```

Kowl supports either case (externally managed groups being a bit tricky).

### Configuration

To configure the Google groups sync you need to create a service account in Google Cloud and later on make this account available in Kowl. [This guide](https://github.com/cloudhut/kowl/blob/master/docs/provider-setup/google.md#4-google-groups-sync-optional) describes the process how to create the service account so that you'll end up with a JSON file which we'll need in the next section.

Once you have created the service account and granted the permissions as shown in the guide, you need to make the service account (JSON file) accessible for Kowl. If you are going to run it in Kubernetes you could use volumes and volume mounts. 

```yaml
login:
  # jwtSecret: set via --login.jwt-secret flag
  google:
    enabled: true
    clientId: xy-hash.apps.googleusercontent.com
    # clientSecret: set via --login.google.client-secret flag
    serviceAccountFilepath: ./configs/sa-google-admin.json
    domain: mycompany.com
    targetPrincipal: admin@mycompany.com
```

Only the following three properties are new and therefore relevant for the RBAC Sync on Groups:

`serviceAccountFilepath` : Path to the JSON file which represents the service account

`domain` : Domain which you want to resolve groups on (e.g. `mycompany.com`)

`targetPrincipal` : An administrative email address on your organization's domain. This is the identity which will be impersonated by Kowl (e.g. `admin@mycompany.com).

## GitHub

To be created...