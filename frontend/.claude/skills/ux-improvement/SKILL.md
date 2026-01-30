---
name: ux-improvement
description: Perform deep UX analysis including backend schema analysis, user journey mapping, validation comparison, and actionable recommendations. Use when user mentions 'improve UX', 'user experience', 'user journey', 'UX analysis', or wants to evaluate if UX matches backend expectations.
---

# UX Analysis & Improvement

Systematic UX analysis of features to create comprehensive documentation and actionable improvement recommendations.

## Activation Conditions

- User mentions "improve UX", "user experience", "UX analysis"
- Evaluating if UX aligns with backend validation/schema
- Requests to redesign or evaluate a feature
- Questions about user journeys, flows, or mental models

## Quick Reference

| Action | Rule |
|--------|------|
| Analysis output | `output-format.md` |
| Where to look | `common-patterns.md` |
| How to evaluate | `evaluation-dimensions.md` |
| Best practices | `best-practices.md` |

## Input Requirements

The user should provide:

1. **Feature entry point**: Path to main component (required)
2. **Feature name**: Name of the feature (optional, can be inferred)
3. **Specific focus**: Particular UX concerns (optional)

Example:

```
Analyze the gateway configuration UX.
Entry point: app/routes/gateways/$gatewayId/index.tsx
```

## Analysis Process

Follow this 7-step methodology systematically:

### Step 1: Feature Identification

**Objective**: Understand what the feature is and why it exists.

**Actions**:

1. Read the entry point file provided by user
2. Identify related components via imports
3. Search for feature documentation or comments
4. Determine the feature's purpose and user goals

**Output**: Brief overview of feature purpose, user goals, and business value.

### Step 2: Backend Schema Analysis

**Objective**: Document backend expectations and validation rules.

**Actions**:

1. Search for protobuf definitions in `app/gen/**/*_pb.ts`
2. Identify related proto message types
3. Document all fields, types, and constraints
4. Note validation rules (required fields, oneofs, dependencies)
5. Create a table of backend expectations

**Output**: Complete backend schema documentation with:

- Proto message structures
- Field types and optionality
- Validation rules and constraints
- Field dependencies (e.g., "if field A is set, field B is required")

### Step 3: Frontend Schema Analysis

**Objective**: Document frontend validation and compare to backend.

**Actions**:

1. Find form models (usually in component or hook files)
2. Read Zod or other validation schemas
3. Document frontend validation rules
4. Create comparison table: Frontend vs Backend validation
5. Identify any gaps or mismatches
6. Note UI components used

**Output**: Frontend schema documentation with:

- FormValues type structure
- Zod validation rules
- Comparison table showing frontend vs backend validation
- List of any gaps or mismatches

### Step 4: User Journey Mapping

**Objective**: Map the complete user flow through the feature.

**Actions**:

1. Trace user flow from entry to completion
2. Identify all UI states (initial, loading, error, success)
3. Document decision points and branches
4. Note validation timing (onChange, onSubmit, etc.)
5. Document error states and messaging
6. Create visual flow diagram (text-based)
7. Map component hierarchy
8. Document test IDs used (pattern: `{component}-{element}-{type}`)
9. Note progressive disclosure patterns (fields shown/hidden based on state)

**Output**: Detailed user journey with:

- High-level flow diagram
- Step-by-step walkthrough
- Decision points and branches
- Validation points
- Error states and messaging
- Component hierarchy
- Test ID inventory for testability assessment
- Progressive disclosure behaviors

### Step 5: Feature Context Research

**Objective**: Understand how users expect this feature to work.

**Actions**:

1. Use WebSearch to research the feature type (e.g., "API gateway configuration best practices")
2. Search for industry standards and patterns
3. Research how similar features work in other products
4. Identify domain-specific concepts users need to understand
5. Document user mental models

**Output**: Feature context documentation with:

- Industry standards and best practices
- User mental models from domain knowledge
- Common patterns for this type of feature
- Key concepts users need to understand

### Step 6: UX Evaluation

**Objective**: Evaluate UX quality across 7 dimensions.

See `evaluation-dimensions.md` for detailed guidance.

**Dimensions**:

1. **Backend-UX Alignment**: Does UX represent backend constraints?
2. **User Mental Model Alignment**: Does UX match user expectations?
3. **Progressive Disclosure**: Is complexity revealed appropriately?
4. **Error Prevention**: Are users guided to avoid errors?
5. **Feedback & Guidance**: Do users understand what's happening?
6. **Consistency**: Is UX consistent with similar features?
7. **Smart Field Dependencies**: Do fields auto-enable/disable appropriately?

**Output**: UX evaluation with:

- ✅ Strengths for each dimension
- ⚠️ Gaps for each dimension
- Specific examples from the code

### Step 7: Improvement Recommendations

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
6. Identify similar features that could benefit from same improvements

**Output**: Prioritized recommendations with:

- Critical issues (must fix)
- Important improvements (should fix)
- Nice-to-have enhancements (could fix)
- Design questions to resolve
- Implementation considerations
- Pattern consistency opportunities

## Key Locations

| Location | Purpose |
|----------|---------|
| `app/gen/**/*_pb.ts` | Proto definitions |
| `app/routes/` | Route components |
| `app/hooks/` | Data fetching hooks |
| `app/lib/redpanda-ui/` | UI components |

## UX vs UI Focus

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

## Success Criteria

A successful analysis includes:

1. ✅ Complete backend schema with validation rules
2. ✅ Complete frontend schema with validation rules
3. ✅ Validation comparison table
4. ✅ Detailed user journey with decision points
5. ✅ Feature context research
6. ✅ UX evaluation across 7 dimensions
7. ✅ Specific, actionable recommendations
8. ✅ Design questions raised
9. ✅ Code references with line numbers
10. ✅ Clear categorization (critical/important/nice-to-have)
11. ✅ Pattern consistency opportunities identified

## Tips

- **Don't skip the research**: WebSearch for feature context is critical
- **Be thorough**: Read all related files, don't guess
- **Create diagrams**: Text-based flow diagrams help visualize journeys
- **Use tables**: Comparison tables make gaps obvious
- **Quote code**: Include relevant code snippets as examples
- **Be specific**: Every recommendation should be actionable
- **Stay focused**: This is UX analysis, not UI design
- **Document strengths**: Not just problems

## Rules

See `rules/` directory for detailed guidance on output format, common patterns, evaluation dimensions, and best practices.
