---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## Usage

Fetch guidelines via WebFetch from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`, then read the specified files (or ask user for files), apply all rules, and output findings in `file:line` format.
