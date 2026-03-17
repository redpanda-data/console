---
allowed-tools: Bash(git tag:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git fetch:*), Bash(git branch:*), Bash(pwd), Bash(ls:*), Bash(cat:*), Bash(cd:*), Bash(head:*), Bash(echo:*), Read, Write, Edit
description: Generate a changelog comparing a specified tag (or latest if not provided) with the previous version across OSS and enterprise repositories.
---

## Your task

Generate a succinct changelog by comparing a specified git tag with the previous version following semantic versioning patterns. If no tag is specified via $ARGUMENTS, use the latest tag. Take changes in only the OSS repository (current directory), try to ignore any enterprise or adp related changes. Update the root CHANGELOG.md file with up to 10 most significant changes.

The version comparison logic:
- For patch versions (x.y.z): compare with x.y.(z-1) or x.y.(highest patch)
  - Example: 2.8.9 compares with 2.8.7
- For minor versions (x.y.0): compare with x.(y-1).(highest patch)
  - Example: 3.2.0 compares with 3.1.3

## Context

### User provided input for this command

The user provided the following additional input for this command (may be empty): $ARGUMENTS

**Usage**: 
- `changelog` - Generate changelog for the latest tag
- `changelog v2.8.9` - Generate changelog for a specific tag (v2.8.9)
- `changelog 2.8.9` - Generate changelog for a specific tag (accepts with or without 'v' prefix)

### Repository Information
- Current directory: !`pwd`
- OSS repository latest tags: !`git tag --sort=-version:refname | head -10`


### Current State
- OSS current branch: !`git branch --show-current` (should be master)
- OSS git status: !`git status --porcelain`

### Changelog Generation Steps

1. **Determine Version Range**: 
   - If $ARGUMENTS is provided, use that as the target tag (add 'v' prefix if missing)
   - If $ARGUMENTS is empty, get the latest tag from OSS repo
   - Calculate the previous version based on semantic versioning rules
   - Verify both tags exist

2. **Check if Changelog Entry Already Exists**:
   - Read CHANGELOG.md to see if the target version already has an entry
   - If entry exists and there are commits since the tag, update "Master / Unreleased" section instead
   - If no entry exists, proceed with creating a new version section

3. **Collect Changes from OSS Repository**:
   - For existing entries: Get commits since the target tag: `git log --pretty=format:"%s" <target_tag>..HEAD`
   - For new entries: Get commits between versions: `git log --pretty=format:"%s" <prev_tag>..<target_tag>`
   - Filter and categorize commits into [BUGFIX], [IMPROVEMENT], [CHANGE], and [SECURITY]
   - Select up to 10 most significant changes
   -

4. **Update CHANGELOG.md**:
   - **For existing entries**: Update "Master / Unreleased" section with new changes since the tag
   - **For new patch releases**: Create new version section with changes from previous version
   - **For new minor/major releases**: Create new version section using unreleased changes + new changes from previous version
   - Limit to 10 most significant changes total across both repositories
   - Format:
   ```
   ## [v<target_tag>] - YYYY-MM-DD
   
   - [IMPROVEMENT] Description of improvement
   - [BUGFIX] Description of bug fix
   - [CHANGE] Description of breaking or significant change
   - [SECURITY] Description of security fix
   ```

### Classification Guidelines

**[IMPROVEMENT]** entries include:
- New features (feat:, feature:)
- Enhancements to existing functionality
- Performance improvements (perf:)  
- UI/UX improvements
- Documentation updates (docs:)
- Refactoring that adds value (refactor:)

**[BUGFIX]** entries include:
- Bug fixes (fix:)
- Critical patches
- Hotfixes
- Error handling improvements

**[CHANGE]** entries include:
- Breaking changes
- API changes
- Configuration changes
- Deprecations
- Significant architectural changes

**[SECURITY]** entries include:
- Security fixes (security:)
- Vulnerability patches
- Authentication/authorization improvements
- Security-related configuration changes

### Output Requirements

- Update the root `CHANGELOG.md` file appropriately based on the scenario:
  - **Existing version entry**: Update "Master / Unreleased" section with changes since the tag
  - **New patch version**: Create new version section with changes from previous version  
  - **New minor/major version**: Incorporate existing unreleased changes into the new version section
- Limit to 10 most significant changes total across both repositories
- Display a summary of changes found
- Group similar changes together
- Exclude merge commits, version bumps, and CI-only changes
- Use clear, concise descriptions that focus on user-facing changes
- Prioritize user-impacting changes over internal refactoring
- Add in date order to the `CHANGELOG.md` file

### Special Handling for Non-Patch Releases

For minor (x.y.0) and major (x.0.0) releases:
1. **Preserve Unreleased Changes**: Extract existing bullet points from "Master / Unreleased" section
2. **Merge with New Changes**: Combine unreleased changes with new changes from the version comparison
3. **Create Complete Version Section**: Use the merged changes to create a comprehensive changelog entry
4. **Clear Unreleased Section**: Reset "Master / Unreleased" to empty or minimal state after incorporating changes
5. **Maintain Chronological Order**: Ensure changes are ordered logically within each category

### Version-Specific Logic

- **Patch releases (x.y.z where z > 0)**: Only include changes from the comparison range
- **Minor releases (x.y.0)**: Include unreleased changes + comparison range changes
- **Major releases (x.0.0)**: Include unreleased changes + comparison range changes
- **Pre-release versions (x.y.z-alpha/beta/rc)**: Treat as patch releases unless otherwise specified