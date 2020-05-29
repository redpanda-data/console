# Releases

This page describes the release process for Kowl and Kowl Business.

## How to cut a new release

This section strives to provide a checklist what CloudHut members need to do to create a new release. This process may change in the future as we would like automize some of the below described steps. All steps apply to Kowl and Kowl business. Kowl has to be released first as it's used as dependency in Kowl business.

### Versioning strategy

We adhere to [semantic versioning](https://semver.org/).

### Branch management

We maintain a separate branch for each minor release, named `release-<major>.<minor>`, e.g. `release-1.1`, `release-2.0`. Using separate branches we can provide critical bug fixes and security patches to multiple minor releases without being forced to include changes from the master branch. Release candidates and patch releases for any given major or minor release happen in the same `release-<major>.<minor>` branch. Do not create `release-<version>` for patch or release candidate releases.

The usual flow is to merge new features and changes into the master branch and to merge bug fixes into the latest release branch. Bug fixes are then merged into master from the latest release branch. The master branch must contain all commits from the latest release branch. As long as master hasn't deviated from the release branch, new commits can also go to master, followed by merging master back into the release branch.

If a bug fix got accidentally merged into master after non-bug-fix changes in master, the bug-fix commits have to be cherry-picked into the release branch, which then have to be merged back into master. Try to avoid that situation.

Maintaining the release branches for older minor releases happens on a best effort basis.

### Dependency management

A few days before a major or minor release, consider updating the dependencies. This also includes the docker base image version as well as the Go version used for compiling the binary.

Note that after a dependency update, you should look out for any weirdness that might have happened.

### Changelog management

Note that `CHANGELOG.md` should only document changes relevant to users of Kowl, including UI/UX improvements, new features and new config settings. Do not document changes of internal interfaces, code refactorings and clean-ups, changes to the build process, etc. People interested in these are asked to refer to the git history.

For release candidates still update CHANGELOG.md, but when you cut the final release later, merge all the changes from the pre-releases into the one final update.

Entries in the CHANGELOG.md are meant to be in this order:

- [CHANGE]
- [FEATURE]
- [ENHANCEMENT]
- [BUGFIX]

### Checklist

**Note:** Changelogs from Kowl Business are published into the cloudhut/kowl repository.

#### Kowl

1. Consider updating dependencies
2. Test master branch in a real world environment to ensure stability
3. Create a new branch as described in [Branch management](#branch-management)
4. Update `CHANGELOG.md`
5. Submit a proper PR pointing to the new branch so that others can chime in and suggest changes
6. When approved and merged create a new release (with changelog) choosing the right target branch

#### Kowl Business

1. Consider updating dependencies
2. Update Kowl dependency
3. Test master branch in a real world environment to ensure stability
4. Create a new branch as described in [Branch management](#branch-management)
5. Update `CHANGELOG.md` (in Kowl repo)
6. Submit a proper PR pointing to the new branch so that others can chime in and suggest changes
7. When approved and merged create a new release choosing the right target branch
