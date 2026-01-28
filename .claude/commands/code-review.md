---
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr comment:*), mcp__github_inline_comment__create_inline_comment
description: Code review a pull request and post review as PR comment
---

# Code Review Pull Request

Review pull request #$ARGUMENTS and post your review as a comment.

## Pre-Review Checks

Before reviewing, verify:
1. The PR is not closed or a draft
2. Claude has not already reviewed this PR (check existing comments)

If any of these apply, stop and explain why.

## Review Process

1. **Get PR context**: Use `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS` to understand the changes

2. **Check for CLAUDE.md guidelines**: Look for CLAUDE.md files in the repository root and directories containing modified files

3. **Review the changes** focusing on:
   - **Bugs**: Syntax errors, type errors, logic errors that will definitely cause problems
   - **Security**: Obvious security vulnerabilities (injection, auth bypass, etc.)
   - **CLAUDE.md compliance**: Violations of documented coding standards

## Critical Review Standards

**Only flag issues that are:**
- Code that will fail to compile or parse
- Clear logic errors that will produce wrong results
- Unambiguous CLAUDE.md violations with specific rules quoted
- Obvious security vulnerabilities

**Do NOT flag:**
- Style preferences or subjective improvements
- Potential issues that depend on specific inputs
- Pre-existing issues not introduced by this PR
- Issues that linters will catch
- Pedantic nitpicks

*If you're not certain an issue is real, don't flag it.*

## Posting the Review

After analysis, post your review:

1. **If issues found**: Post inline comments using `mcp__github_inline_comment__create_inline_comment` for specific issues, then post a summary comment with `gh pr comment $ARGUMENTS --body "REVIEW"`

2. **If no issues found**: Post a clean review comment:
   ```
   gh pr comment $ARGUMENTS --body "## Code Review

   No significant issues found. Changes look good.

   **Checked for:**
   - Bugs and logic errors
   - Security vulnerabilities
   - CLAUDE.md compliance"
   ```

## Comment Format

For the summary comment, use this structure:

```markdown
## PR Review

### Summary
[Brief description of what this PR does]

### Issues Found
[List any issues with severity and location]

### Recommendation
[Approve/Request Changes with reasoning]

---
*Review by Claude*
```

**IMPORTANT**: Always post the review as a PR comment. Do not just output the review text.
