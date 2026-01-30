---
title: UX Analysis Output Format
impact: HIGH
impactDescription: Consistent output format ensures comprehensive, actionable analysis
tags: ux, documentation, template, analysis
---

# UX Analysis Output Format

Generate a comprehensive markdown document with this structure.

## Document Template

```markdown
# [Feature Name] UX Analysis

## Table of Contents
1. Feature Overview
2. Backend Schema
3. Frontend Schema
4. Current User Journey
5. Feature Context & Mental Models
6. UX Evaluation
7. Improvement Recommendations
8. References

## 1. Feature Overview

### Purpose
[What problem does this solve?]

### User Goals
[What are users trying to accomplish?]

### Business Value
[Why does this feature exist?]

### Entry Points
[Where/how do users access this?]

## 2. Backend Schema

### Proto Definitions
[Key message types and their structure]

### Validation Rules
[Backend constraints from proto]

### Field Dependencies
[Required fields, mutual dependencies, oneofs]

### Backend Expectations
[What the backend expects from the frontend]

## 3. Frontend Schema

### Form Model
[FormValues type structure]

### Validation Schema
[Zod/validation rules]

### Frontend-Backend Comparison
| Field | Frontend Validation | Backend Validation | Match? |
|-------|---------------------|-------------------|--------|
| ...   | ...                 | ...               | ✅/⚠️  |

### Gaps/Mismatches
[Any discrepancies with specific examples]

## 4. Current User Journey

### High-Level Flow
[Text-based diagram of main flow]

### Detailed Steps
[Step-by-step walkthrough]

### Decision Points
[Where users make choices]

### Validation Points
[When/where validation occurs]

### Error States
[How errors are shown]

### Component Hierarchy
[Visual breakdown of components]

## 5. Feature Context & Mental Models

### Industry Standards
[How similar features work elsewhere]

### User Mental Models
[How users expect this to work]

### Common Patterns
[Established UX patterns]

### Domain Concepts
[Key concepts users need to understand]

## 6. UX Evaluation

### Backend-UX Alignment
✅ **Strengths**: [What works well]
⚠️ **Gaps**: [Where UX doesn't match backend]

### User Mental Model Alignment
✅ **Strengths**: [What matches expectations]
⚠️ **Gaps**: [What confuses users]

### Progressive Disclosure
[Analysis with examples]

### Error Prevention & Recovery
[How well errors are prevented/handled]

### Feedback & Guidance
[Quality of user guidance]

### Consistency
[Consistency with rest of app]

## 7. Improvement Recommendations

### Critical Issues
1. **[Issue]**: [Description]
   - **Why critical**: [Impact]
   - **Recommendation**: [Specific fix]

### Important Improvements
1. **[Issue]**: [Description]
   - **Impact**: [User pain point]
   - **Recommendation**: [Specific fix]

### Nice-to-Have Enhancements
1. **[Enhancement]**: [Description]
   - **Benefit**: [Value to users]
   - **Recommendation**: [Specific improvement]

### Design Questions
1. [Question that needs decision]
2. [Question that needs decision]

### Implementation Considerations
[Technical constraints or opportunities]

## 8. References

### Code Locations
- Entry point: [file:line]
- Backend schema: [file:line]
- Frontend schema: [file:line]

### External Resources
[Documentation, standards, etc.]

### Related Features
[Similar features in codebase]
```

## Save Location

Save the analysis document to:

```
docs/{feature-name}-ux-analysis.md
```

Example: `docs/gateway-configuration-ux-analysis.md`
