# Claude Code Skills

This directory contains specialized skills that extend Claude's capabilities for this project.

## Available Skills

### 🎨 improve-ux
**Deep UX analysis and improvement recommendations**

Performs systematic analysis of features including backend schema, user journey mapping, validation comparison, context research, and actionable recommendations.

**See**: `improve-ux/SKILL.md` for full documentation and `improve-ux/reference.md` for example output

---

### 👨‍💻 frontend-developer
**Build UIs with Redpanda UI Registry**

Guides building user interfaces using the Redpanda UI Registry design system with React, TypeScript, and Vitest testing following repo conventions.

**See**: `frontend-developer/SKILL.md` for full documentation

---

## How Skills Work

Skills are model-invoked—Claude autonomously decides when to use them based on your request and the skill's description. You don't need to explicitly invoke skills; just describe what you want to accomplish.

For example, if you say:
> "I want to improve the UX of the topic creation form"

Claude will automatically use the `improve-ux` skill if appropriate.

## Skill Structure

Each skill is a directory containing:
- `SKILL.md` (required) - Skill definition with YAML frontmatter
- `reference.md` (optional) - Examples and detailed documentation
- `examples.md` (optional) - Additional examples
- Other supporting files as needed

## Creating New Skills

Follow Claude Code conventions (see https://code.claude.com/docs/en/skills):

1. Create directory: `.claude/skills/skill-name/`
2. Create `SKILL.md` with YAML frontmatter:
```yaml
---
name: skill-name
description: "What it does + when Claude should use it"
allowed-tools: Read, Write, Grep, Glob
---
```
3. Write clear instructions for Claude in markdown
4. Test by using natural language that matches the description
5. Update this README

## Best Practices

**Good descriptions** are specific and include trigger terms:
> "Extract text from PDFs, fill forms, merge documents. Use when working with PDFs or document extraction."

**Bad descriptions** are vague:
> "Helps with documents"

**Keep skills focused**: One skill = one capability

## Questions?

See individual skill `SKILL.md` files for detailed documentation.
