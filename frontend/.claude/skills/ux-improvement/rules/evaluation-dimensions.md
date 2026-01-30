---
title: UX Evaluation Dimensions
impact: HIGH
impactDescription: Systematic evaluation across 7 dimensions ensures comprehensive UX analysis
tags: ux, evaluation, heuristics, quality
---

# UX Evaluation Dimensions

Evaluate each feature across these 7 dimensions. Document both strengths (✅) and gaps (⚠️) with specific code examples.

## 1. Backend-UX Alignment

**Question**: Does the UX accurately represent backend constraints?

**Check for:**

- Required fields marked as required in UI
- Field constraints (min/max length, patterns) enforced
- `oneof` fields shown as mutually exclusive options
- Field dependencies reflected in UI (if A, then B required)
- Error messages match backend validation

**Example evaluation:**

```
✅ Strengths: Required fields have asterisks, min length enforced
⚠️ Gaps: Backend requires email format but frontend only checks non-empty
```

## 2. User Mental Model Alignment

**Question**: Does the UX match how users think about this feature?

**Check for:**

- Terminology matches domain concepts
- Grouping matches user expectations
- Order of fields follows natural workflow
- Labels are clear and unambiguous

**Example evaluation:**

```
✅ Strengths: Certificate fields grouped logically
⚠️ Gaps: "Bootstrap servers" label confusing for non-Kafka users
```

## 3. Progressive Disclosure

**Question**: Is complexity revealed appropriately?

**Check for:**

- Simple defaults with advanced options hidden
- Related options grouped and collapsible
- Optional features clearly marked
- Sensible defaults pre-filled

**Example evaluation:**

```
✅ Strengths: TLS options hidden until TLS enabled
⚠️ Gaps: All 15 fields visible at once, overwhelming for new users
```

## 4. Error Prevention

**Question**: Are users guided to avoid errors?

**Check for:**

- Inline validation before submit
- Clear input constraints shown
- Confirmation for destructive actions
- Undo capability where appropriate

**Example evaluation:**

```
✅ Strengths: Delete requires confirmation
⚠️ Gaps: Invalid input only caught on submit, no inline feedback
```

## 5. Feedback & Guidance

**Question**: Do users understand what's happening?

**Check for:**

- Loading states during async operations
- Success messages after actions
- Error messages are specific and actionable
- Help text for complex fields
- Tooltips where helpful

**Example evaluation:**

```
✅ Strengths: Spinner shown during save
⚠️ Gaps: Generic "Error" message, no guidance on how to fix
```

## 6. Consistency

**Question**: Is the UX consistent with similar features?

**Check for:**

- Same patterns used across similar features
- Consistent button placement
- Consistent field ordering
- Same terminology for same concepts

**Example evaluation:**

```
✅ Strengths: Save/Cancel buttons match other forms
⚠️ Gaps: This form uses inline validation, others use onSubmit only
```

## 7. Smart Field Dependencies

**Question**: Do related fields auto-enable/disable appropriately?

**Check for:**

- Dependent fields enable when parent is set
- Mutually exclusive options disable alternatives
- Related fields grouped visually
- Clear indication of dependencies

**Example evaluation:**

```
✅ Strengths: OAuth fields appear when OAuth selected
⚠️ Gaps: TLS certificate field enabled even when TLS is off
```

## Evaluation Template

For each dimension, use this format:

```markdown
### [Dimension Name]

✅ **Strengths**:
- [What works well]
- [Another strength]

⚠️ **Gaps**:
- [What's missing or broken]
- [Another gap]

**Code example**:
[Relevant code snippet showing the issue]
```
