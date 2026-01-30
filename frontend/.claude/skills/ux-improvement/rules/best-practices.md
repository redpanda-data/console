---
title: UX Analysis Best Practices
impact: MEDIUM
impactDescription: Follow these practices for actionable, balanced UX analysis
tags: ux, analysis, recommendations, best-practices
---

# UX Analysis Best Practices

## Validation Comparison Table

**Always** create a comparison table for validation rules:

| Field | Frontend | Backend | Match? | Issue |
|-------|----------|---------|--------|-------|
| Email | Required, email format | Required | ✅ | None |
| Password | Min 6 chars | Min 8 chars | ⚠️ | Frontend too permissive |
| Port | Any number | 1-65535 | ⚠️ | Frontend allows invalid ports |

This makes gaps immediately visible.

## Be Specific in Recommendations

**Good (specific):**

> "Add inline validation for email field that checks format on blur and shows error message below the field using `<FieldError>` component"

**Bad (vague):**

> "Improve validation"

**Good (specific):**

> "Move TLS certificate fields into a collapsible section that expands when 'Enable TLS' is toggled on"

**Bad (vague):**

> "Use progressive disclosure"

## Document What Works Too

Don't just list problems. Document strengths to:

- Recognize good patterns to preserve
- Understand what to replicate elsewhere
- Provide balanced analysis
- Give credit where due

## Categorize Recommendations

### Critical (Must Fix)

- Blocks users from completing tasks
- Data loss risk
- Security issues
- Accessibility blockers

### Important (Should Fix)

- Causes confusion
- Inefficient workflows
- Frequent user errors
- Inconsistent with other features

### Nice-to-Have (Could Fix)

- Polish and refinement
- Edge case improvements
- Micro-interactions
- Advanced user features

## Raise Design Questions

Not everything has a clear answer. Raise questions that need product decisions:

- "Should we auto-save drafts or require explicit save?"
- "Is this feature for beginners or power users?"
- "Should validation happen inline or on submit?"

## Include Code References

Always include file paths and line numbers:

```markdown
### Code Locations
- Entry point: `app/routes/gateways/$gatewayId/index.tsx:45`
- Backend schema: `app/gen/redpanda/api/aigateway/v1/gateway_pb.ts:120`
- Validation schema: `app/routes/gateways/-components/GatewayForm.tsx:25`
```

## Research Feature Context

Use WebSearch to understand:

- Industry standards for this feature type
- How competitors handle similar features
- Domain-specific terminology
- User expectations based on prior experience

## UX vs UI Focus

**Analyze (UX):**

- Information architecture
- User flows and journeys
- Validation logic
- Progressive disclosure
- Mental models
- Form organization
- Feedback and guidance

**Don't analyze (UI):**

- Visual design (colors, spacing)
- Component styling (CSS)
- Which button variant to use
- Animation details

## After Analysis

1. Inform user the document is created
2. Highlight 2-3 key findings
3. Ask if they want to focus on specific recommendations
4. Offer to create implementation tasks
