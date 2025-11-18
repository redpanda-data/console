---
name: improve-ux
description: "Perform deep UX analysis of features including backend schema analysis, user journey mapping, validation rule comparison, feature context research, and actionable improvement recommendations. Use when user mentions 'improve UX', 'user experience', 'user journey', 'UX analysis', 'redesign feature', or wants to evaluate if UX matches backend expectations and user mental models."
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Write, Task
---

# UX Analysis & Improvement

This skill performs systematic UX analysis of existing features to create comprehensive documentation and actionable improvement recommendations.

## When to Use

Invoke this skill when the user:
- Wants to understand or improve a feature's user experience
- Needs to evaluate if UX aligns with backend validation/schema
- Requests UX analysis, redesign, or evaluation
- Wants to document feature architecture for UX work
- Mentions user journeys, user flows, or mental models

## Input Requirements

The user should provide:
1. **Feature entry point**: Path to main component (required)
2. **Feature name**: Name of the feature (optional, can be inferred)
3. **Specific focus**: Particular UX concerns (optional)

Example:
```
Analyze the shadow link certificate configuration UX.
Entry point: src/components/pages/shadowlinks/create/connection/bootstrap-servers.tsx
```

## Analysis Process

Follow this 7-step methodology systematically:

### Step 1: Feature Identification (5 minutes)

**Objective**: Understand what the feature is and why it exists.

**Actions**:
1. Read the entry point file provided by user
2. Identify related components via imports
3. Search for feature documentation or comments
4. Determine the feature's purpose and user goals

**Output**: Brief overview of feature purpose, user goals, and business value.

### Step 2: Backend Schema Analysis (10 minutes)

**Objective**: Document backend expectations and validation rules.

**Actions**:
1. Search for protobuf definitions: `src/protogen/**/*_pb.ts`
2. Identify related proto message types
3. Document all fields, types, and constraints
4. Note validation rules (required fields, oneofs, dependencies)
5. Create a table of backend expectations

**Output**: Complete backend schema documentation with:
- Proto message structures
- Field types and optionality
- Validation rules and constraints
- Field dependencies (e.g., "if field A is set, field B is required")

### Step 3: Frontend Schema Analysis (10 minutes)

**Objective**: Document frontend validation and compare to backend.

**Actions**:
1. Find form models (usually `model.ts` or in main component)
2. Read Zod or other validation schemas
3. Document frontend validation rules
4. Create comparison table: Frontend vs Backend validation
5. Identify any gaps or mismatches
6. Note design system components used (Switch, Item, Dropzone, etc.) - reference `ux-patterns` skill if available

**Output**: Frontend schema documentation with:
- FormValues type structure
- Zod validation rules
- Comparison table showing frontend vs backend validation
- List of any gaps or mismatches
- Design system components used in current implementation

### Step 4: User Journey Mapping (15 minutes)

**Objective**: Map the complete user flow through the feature.

**Actions**:
1. Trace user flow from entry to completion
2. Identify all UI states (initial, loading, error, success)
3. Document decision points and branches
4. Note validation timing (onChange, onSubmit, etc.)
5. Document error states and messaging
6. Create visual flow diagram (text-based is fine)
7. Map component hierarchy
8. Document test IDs used (pattern: `{component}-{element}-{type}`)
9. Note any progressive disclosure patterns (fields shown/hidden based on state)

**Output**: Detailed user journey with:
- High-level flow diagram
- Step-by-step walkthrough
- Decision points and branches
- Validation points
- Error states and messaging
- Component hierarchy
- Test ID inventory for testability assessment
- Progressive disclosure behaviors

### Step 5: Feature Context Research (10 minutes)

**Objective**: Understand how users expect this feature to work.

**Actions**:
1. Use WebSearch to research the feature type (e.g., "TLS certificate configuration best practices")
2. Search for industry standards and patterns
3. Research how similar features work in other products
4. Identify domain-specific concepts users need to understand
5. Document user mental models

**Output**: Feature context documentation with:
- Industry standards and best practices
- User mental models from domain knowledge
- Common patterns for this type of feature
- Key concepts users need to understand

### Step 6: UX Evaluation (15 minutes)

**Objective**: Evaluate UX quality across multiple dimensions.

**Actions**:
Evaluate each dimension and document strengths and gaps:

1. **Backend-UX Alignment**: Does the UX accurately represent backend constraints?
2. **User Mental Model Alignment**: Does the UX match how users think about the feature?
3. **Progressive Disclosure**: Is complexity revealed appropriately?
4. **Error Prevention**: Are users guided to avoid errors?
5. **Feedback & Guidance**: Do users understand what's happening?
6. **Consistency**: Is the UX consistent with similar features in the app?
7. **Smart Field Dependencies**: Do related fields auto-enable/disable appropriately? Are field relationships clear?

**Output**: UX evaluation with:
- ✅ Strengths for each dimension
- ⚠️ Gaps for each dimension
- Specific examples from the code

### Step 7: Improvement Recommendations (15 minutes)

**Objective**: Provide actionable recommendations.

**Actions**:
1. List all identified UX problems
2. Categorize by severity:
   - **Critical**: Must fix (blocks users, data loss risk, security issues)
   - **Important**: High-value improvements (confusion, inefficiency)
   - **Nice-to-have**: Lower priority enhancements
3. Suggest specific improvements for each problem
4. Raise design questions that need decisions
5. Note any technical constraints or opportunities
6. Reference established patterns from `ux-patterns` skill when applicable
7. Identify similar features that could benefit from same improvements (pattern consistency)

**Output**: Prioritized recommendations with:
- Critical issues (must fix)
- Important improvements (should fix)
- Nice-to-have enhancements (could fix)
- Design questions to resolve
- Implementation considerations
- Pattern references and consistency opportunities

## Output Format

Generate a comprehensive markdown document with this structure:

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
|-------|-------------------|-------------------|--------|
| ...   | ...               | ...               | ✅/⚠️  |

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

## Important Notes

### UX vs UI Focus

**This skill analyzes USER EXPERIENCE:**
- ✅ Information architecture and structure
- ✅ User flows and journeys
- ✅ Validation logic and error handling
- ✅ Progressive disclosure
- ✅ Mental models and expectations
- ✅ Form field organization
- ✅ Feedback and guidance

**This skill does NOT analyze UI:**
- ❌ Visual design (colors, spacing, typography)
- ❌ Component styling (CSS, Tailwind classes)
- ❌ UI component selection (which button variant)
- ❌ Layout details and visual hierarchy
- ❌ Animation and transitions

### Validation Comparison Best Practice

Always create a comparison table for validation rules:

| Field | Frontend | Backend | Match? | Issue |
|-------|----------|---------|--------|-------|
| Email | Required, email format | Required | ✅ | None |
| Password | Min 6 chars | Min 8 chars | ⚠️ | Frontend too permissive |

This makes gaps immediately visible.

### Be Specific in Recommendations

**Good (specific)**:
> "Add inline validation for email field that checks format on blur and shows error message below the field"

**Bad (vague)**:
> "Improve validation"

### Document What Works Too

Don't just list problems. Document strengths to:
- Recognize good patterns to preserve
- Understand what to replicate elsewhere
- Provide balanced analysis

## Example Output

See the example analysis in `reference.md` which shows a complete UX analysis of the shadow link certificate feature.

## Estimated Time

- Simple feature: 45-60 minutes
- Complex feature: 75-90 minutes
- Focus on specific aspect: 30-45 minutes

## Save Location

Save the analysis document to:
```
docs/{feature-name}-ux-analysis.md
```

Example: `docs/shadow-link-certificate-ux-analysis.md`

## After Analysis

After completing the analysis:
1. Inform the user the document has been created
2. Highlight 2-3 key findings
3. Ask if they want to focus on any specific recommendations
4. Offer to create implementation tasks if requested

## Common Patterns to Look For

### Backend Schema
- Look in `src/protogen/**/*_pb.ts` for proto definitions
- Check for `required`, `optional`, validation annotations
- Look for `oneof` fields (mutually exclusive options)
- Check for field dependencies in comments

### Frontend Schema
- Look for `model.ts` files in feature directories
- Search for `z.object()` (Zod schemas)
- Look for `.superRefine()` for custom validation
- Check `FormValues` type definitions

### User Journey
- Multi-step wizards often use Stepper components
- Look for form validation in `onSubmit` handlers
- Check for validation triggers (`mode: 'onChange'`, `mode: 'onBlur'`)
- Look for error state handling

### Common UX Issues
- Frontend validation less strict than backend
- Missing inline validation (errors only on submit)
- Unclear error messages (generic "Invalid input")
- Complex fields without explanatory text
- No progressive disclosure (everything visible at once)
- Inconsistent patterns across similar features

## Success Criteria

A successful analysis includes:

1. ✅ Complete backend schema with validation rules
2. ✅ Complete frontend schema with validation rules
3. ✅ Validation comparison table
4. ✅ Detailed user journey with decision points
5. ✅ Feature context research
6. ✅ UX evaluation across 7 dimensions (including Smart Field Dependencies)
7. ✅ Specific, actionable recommendations
8. ✅ Design questions raised
9. ✅ Code references with line numbers
10. ✅ Clear categorization (critical/important/nice-to-have)
11. ✅ Pattern consistency opportunities identified

## Tips for Claude

- **Don't skip the research**: WebSearch for feature context is critical
- **Be thorough**: Read all related files, don't guess
- **Create diagrams**: Text-based flow diagrams help visualize journeys
- **Use tables**: Comparison tables make gaps obvious
- **Quote code**: Include relevant code snippets as examples
- **Be specific**: Every recommendation should be actionable
- **Stay focused**: This is UX analysis, not UI design
- **Document strengths**: Not just problems

For detailed examples and templates, see `reference.md`.
