---
allowed-tools: mcp__claude_ai_Slack__slack_read_channel, mcp__claude_ai_Slack__slack_search_channels, mcp__claude_ai_Slack__slack_search_public, mcp__claude_ai_Slack__slack_read_thread, mcp__claude_ai_Slack__slack_send_message, mcp__claude_ai_Slack__slack_send_message_draft, Bash(acli jira:*), Bash(git log:*), Bash(git tag:*), Bash(gh pr:*), Read, Write, Glob, Grep
description: Triage a help-console or help-ux Slack message into a UX Jira ticket
---

## Triage Help Channel Message

You are triaging a Slack message from #help-console or #help-ux into a Jira ticket on the UX board.

**Channel IDs:**
- #help-console: C02RQPX6A1K
- #help-ux: C03P1GL0UF4

### Arguments

`$ARGUMENTS` — the user will provide ONE of:
- A Slack message link (e.g. `https://redpanda-data.slack.com/archives/C.../p...`)
- A description of which message to triage (e.g. "the one about topic deletion from @alice")
- Nothing — in which case, fetch the last 5 messages and ask which one to triage

### Step 1: Find the message

**If a Slack link was provided:**
- Extract the channel ID and message timestamp from the URL
- Read the thread to get full context

**If a description was provided:**
- Search #help-console and #help-ux for matching recent messages
- Present the match and confirm with the user before proceeding

**If no argument:**
- Read the last 5 messages from #help-console
- Read the last 5 messages from #help-ux
- Present them as a numbered list with author, timestamp, and preview
- Ask the user which one to triage (by number)
- Wait for the user's selection before proceeding

### Step 2: Investigate prior fixes

Before classifying, check if the reported issue has already been fixed:

1. **Search git history** for related commits:
   - `git log --oneline --all --since="6 months ago" --grep="<keywords>"` using keywords from the report
   - Also search in relevant source directories: `git log --oneline --all --since="6 months ago" --grep="<keywords>" -- 'frontend/src/components/pages/<relevant>/'`

2. **Search PRs** for related fixes:
   - `gh pr list --state all --search "<keywords>" --limit 10 --json number,title,state,mergedAt`

3. **Check release inclusion** — if a relevant fix is found:
   - `git tag --contains <commit>` to see which releases include the fix
   - `git tag --sort=-version:refname | head -5` for latest releases
   - Determine if the fix is in the latest release and which version introduced it

4. **Search Slack** for prior discussion of the same issue:
   - `slack_search_public` with relevant keywords + `after:YYYY-MM-DD`

5. **Search existing Jira tickets** for duplicates:
   - `acli jira workitem search --jql "project = UX AND text ~ \"<keywords>\"" --limit 5 --fields "key,summary,status" --csv`

Present findings to the user. If the issue appears already fixed in a recent release:
- Note which PR/commit fixed it and which release includes it
- Flag that this may be a version issue, not a new bug
- Still create the ticket but note the investigation findings

### Step 3: Analyze and classify

Read the full message and any thread replies. Determine:
- **Type**: Bug or Task
  - Bug: something is broken, erroring, not working as expected
  - Task: feature request, question that implies missing functionality, improvement
- **Summary**: concise title (under 80 chars)
- **Description**: structured as:
  - **Reporter**: who posted in Slack (name + handle)
  - **Slack link**: link to the original message
  - **Problem**: what they reported
  - **Context**: any relevant thread replies or details
  - **Steps to reproduce** (if Bug and enough info)
  - **Investigation**: what was found in git/PRs/Slack (prior fixes, related tickets)
- **Priority**: infer from urgency/impact language

Present the draft ticket to the user for approval before creating.

### Step 4: Ask follow-up questions in Slack thread

If the report is missing critical information, post a follow-up question in the Slack thread BEFORE creating the ticket. Common questions to ask:

- **Version**: "What version of Redpanda Console are you running? (The fix for this may already be in a newer release.)"
- **Reproduction steps**: "Can you share the steps to reproduce this?"
- **Environment**: "Is this on self-managed or cloud? What deployment method (Helm, Docker, binary)?"
- **Screenshots/logs**: "Do you have any screenshots or error logs?"

Always create follow-up questions as a Slack draft using `mcp__claude_ai_Slack__slack_send_message_draft` with the thread_ts. The user can review and edit in Slack before sending. Combine follow-up questions with the ticket reply in Step 6 into a single draft when possible.

Only ask questions that are genuinely needed — don't ask for info already provided in the message or thread.

### Step 5: Create the Jira ticket

Once the user approves:

```bash
acli jira workitem create \
  --project UX \
  --type <Bug|Task> \
  --summary "<summary>" \
  --description "<description>"
```

Do NOT assign the ticket — leave it unassigned so the team can triage and assign during planning.

Capture the created ticket key from the output.

### Step 6: Post to Slack thread

Draft a reply for the original Slack message thread:

> Triaged as **<KEY>**: <summary>
> https://redpandadata.atlassian.net/browse/<KEY>

Always create this as a Slack draft using `mcp__claude_ai_Slack__slack_send_message_draft` with the thread_ts of the original message. The user can review and edit it in Slack before sending. If there are follow-up questions from Step 4, combine them into a single message with the ticket link.

When referencing PRs, always use the full GitHub URL (e.g. https://github.com/redpanda-data/console/pull/2269) so they render as clickable links in Slack.

### Step 7: Set as active ticket

Write the ticket key to `.claude/jira-ticket` so subsequent work in this session is tracked against it.

### Important

- Only triage the ONE message the user selected — never batch-process
- Always show the draft ticket and wait for user approval before creating
- Always investigate prior fixes before drafting the ticket
- If the message is unclear or lacks detail, include what you have and note gaps in the description
- If a similar ticket already exists (search with acli), flag it to the user instead of duplicating
- When posting follow-up questions to Slack, always confirm with the user first
