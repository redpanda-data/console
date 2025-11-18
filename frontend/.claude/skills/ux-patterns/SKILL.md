---
name: ux-patterns
description: "Reference library of high-level UX patterns for Redpanda Console. Use when designing or revamping UIs to understand established patterns for progressive disclosure, visual selection, multi-step workflows, smart dependencies, and state management. Provides principles with real examples from the codebase."
allowed-tools: Read
---

# UX Patterns Reference

High-level UX patterns established in Redpanda Console. These patterns represent validated approaches to common UI/UX challenges, extracted from successful implementations.

## When to Use

Reference this skill when:
- Designing new features or workflows
- Revamping existing UIs for better UX
- Choosing interaction patterns (wizards, toggles, tiles, etc.)
- Need guidance on progressive disclosure or field dependencies
- Ensuring consistency with established patterns
- Making UX decisions (when to use dialogs, how to handle complex forms, etc.)

---

## Pattern Index

1. [Progressive Disclosure](#1-progressive-disclosure)
2. [Visual Selection](#2-visual-selection)
3. [Multi-Step Workflows](#3-multi-step-workflows)
4. [Smart Field Dependencies](#4-smart-field-dependencies)
5. [Search & Filter](#5-search--filter)
6. [Contextual Assistance](#6-contextual-assistance)
7. [State Visualization](#7-state-visualization)
8. [Confirmation Patterns](#8-confirmation-patterns)
9. [Persistent State](#9-persistent-state)
10. [Priority & Ordering](#10-priority--ordering)

---

## 1. Progressive Disclosure

### Principle
Reveal complexity gradually. Start simple, show advanced options only when needed.

### When to Use
- Complex forms with optional advanced settings
- Features that build on each other (TLS → mTLS)
- Reducing initial cognitive load
- Optional configuration sections

### Pattern: Hierarchical Toggles
**UX**: Primary toggle → reveals base options → secondary toggle → reveals advanced options

**Why It Works**:
- Reduces initial overwhelm
- Makes feature relationships clear (mTLS requires TLS)
- Modern convention users expect

**Example from codebase**:
- **Shadow Links TLS Configuration** (`tls-configuration.tsx`)
  - Enable TLS → shows CA certificate field
  - Enable mTLS → shows client cert + key fields
  - Disabling TLS auto-disables mTLS (smart dependency)

**Example from codebase**:
- **Onboarding Wizard** (`onboarding-wizard.tsx`)
  - Step-by-step reveal of complexity
  - Each step builds on previous context
  - Can return to previous steps

### Pattern: Content Cards with Collapsible Sections
**UX**: Card header with toggle/action → card content revealed when enabled

**Implementation Guidance**:
- Put the enable/disable control in card header
- Hide entire card content when disabled
- Use Switch for binary enable/disable
- Use Card component from UI registry

---

## 2. Visual Selection

### Principle
Use visual elements (icons, logos, tiles) to help users recognize and select options quickly.

### When to Use
- Choosing from many options (10+)
- Options have recognizable visual identity (logos, icons)
- User needs to scan and compare quickly
- Brand/product selection

### Pattern: Tile Grid with Logos
**UX**: Grid of selectable tiles, each showing logo + name + brief description

**Why It Works**:
- Faster recognition than text-only lists
- Scannable layout
- Clear selection state
- Works well with search/filter

**Example from codebase**:
- **RP Connect Onboarding** (`connect-tiles.tsx`, `connect-tile.tsx`)
  - Grid of connector tiles with logos
  - Search bar filters tiles
  - Category/type filters
  - Checked state with animation
  - Priority components shown first

**Component to Use**: `Choicebox`, `ChoiceboxItem` from UI registry

**Key Features**:
- Display logo (use `componentLogoMap` or custom logos)
- Show status badges for beta/experimental
- Handle checked/unchecked states
- Responsive grid layout (adjust columns for dialog vs full page)

---

## 3. Multi-Step Workflows

### Principle
Break complex tasks into manageable steps. Show progress, allow navigation, persist state.

### When to Use
- Setup/onboarding flows
- Complex configuration with multiple stages
- Workflows with dependencies (step 2 needs step 1 data)
- Tasks that take time or require multiple decisions

### Pattern: Wizard with Stepper
**UX**: Visual stepper → step content → navigation buttons (Back/Next)

**Why It Works**:
- Reduces cognitive load per screen
- Shows progress and context
- Allows correction without losing work
- Natural mental model for sequential tasks

**Example from codebase**:
- **RP Connect Onboarding Wizard** (`onboarding-wizard.tsx`)
  - WizardStepper component shows current step
  - Each step is a separate component with ref-based API
  - Back/Next navigation with validation
  - Can jump to steps via URL params
  - State persists across browser sessions (Zustand + persist)

- **Shadow Link Creation** (`shadowlink-create-page.tsx`)
  - Two-step process: Connection → Configuration
  - Stepper from `defineStepper` utility
  - Validation on Next button
  - Form state preserved between steps

**Implementation Guidance**:
- Use `defineStepper` or `WizardStepper` pattern
- Validate current step before allowing Next
- Preserve state (form values) between steps
- Consider URL params for deep linking to steps
- Show clear step titles and optional descriptions

---

## 4. Smart Field Dependencies

### Principle
Fields should auto-enable, auto-disable, or auto-populate based on related field values to prevent invalid states.

### When to Use
- Fields have prerequisite relationships (mTLS requires TLS)
- Mutually exclusive options
- Dependent fields should be hidden when parent disabled
- Preventing validation errors proactively

### Pattern: Auto-Enable/Disable
**UX**: Enabling field A automatically shows/enables field B; disabling A hides/disables B

**Why It Works**:
- Prevents invalid state combinations
- Reduces user errors
- Clear cause-and-effect relationship
- Better UX than showing validation errors

**Example from codebase**:
- **Shadow Links TLS/mTLS** (`tls-configuration.tsx:209-221`)
  - Disabling TLS auto-disables mTLS
  - Enabling mTLS auto-enables TLS if disabled
  - Implements prerequisite relationship

### Pattern: Conditional Rendering
**UX**: Show fields only when relevant based on other selections

**Example from codebase**:
- **Onboarding Input Selection** (`onboarding-wizard.tsx`)
  - If input is Redpanda, show topic/user configuration step
  - If input is external source, skip those steps
  - Dynamically adjust wizard flow based on selections

**Implementation Guidance**:
```typescript
const handleParentChange = (enabled) => {
  setValue('parent', enabled);
  if (!enabled) {
    setValue('dependentChild', false); // Auto-disable
  }
};

// OR conditional rendering
{parentEnabled && <ChildFields />}
```

---

## 5. Search & Filter

### Principle
For large lists, provide search and faceted filtering to help users find what they need quickly.

### When to Use
- Lists with 10+ items
- Multiple categorization dimensions (type, category, status)
- Users need to find specific items quickly
- Browsing vs searching modes both important

### Pattern: Search Bar + Multi-Select Filters
**UX**: Search input → type/category filters → filtered results

**Why It Works**:
- Search for known items
- Filter to browse categories
- Combine search + filters for power users
- Clear active filters

**Example from codebase**:
- **RP Connect Component Selection** (`connect-tiles.tsx`)
  - Search bar with debounce
  - Type filter (input/output/processor)
  - Category multi-select (cloud, database, etc.)
  - Priority components shown first
  - Empty state for no results

**Implementation Guidance**:
- Use `Input` with `SearchIcon` for search
- Use `SimpleMultiSelect` or `MultiSelect` for filters
- Debounce search input (avoid re-filtering on every keystroke)
- Show count of filtered results
- Provide "Clear filters" action
- Consider priority/featured items shown first

**Component Pattern**:
```typescript
const searchComponents = (
  allItems: Item[],
  query: string,
  filters: { types?: string[], categories?: string[] }
) => {
  // Filter logic combining query and filters
  // Return prioritized results
};
```

---

## 6. Contextual Assistance

### Principle
Provide help, suggestions, or actions relevant to the current context without requiring users to leave their workflow.

### When to Use
- Complex editors or configuration UIs
- Users need to add/configure related items
- Detecting issues or missing required items
- Suggesting next actions

### Pattern: Sidebar Helpers
**UX**: Main content area (editor, form) + sidebar with contextual cards/actions

**Why It Works**:
- Help is visible but non-intrusive
- Context-aware suggestions
- Quick actions without leaving workflow
- Progressive disclosure of complexity

**Example from codebase**:
- **RP Connect Pipeline Editor** (`create-pipeline-sidebar.tsx`)
  - Detects connectors in YAML, offers to add more
  - Detects secret references, offers to create missing secrets
  - Shows contextual variables that can be inserted
  - Each helper is a card with actions
  - Context-aware based on editor content

**Pattern Variations**:
- **Help text near fields**: Use `FormDescription` or `Text` with `variant="small"`
- **Tooltips for icons/actions**: Use `Tooltip` component
- **Inline suggestions**: Show in muted text or as placeholder

**Implementation Guidance**:
- Parse/detect context from main content (editor, form state)
- Use Card components for distinct helpers
- Provide clear actions (buttons, links)
- Show counts ("3 missing secrets")
- Update dynamically as context changes

---

## 7. State Visualization

### Principle
Use distinct visual treatments for different states (empty, filled, loading, error) to give clear feedback.

### When to Use
- Components with multiple distinct states
- Upload/file selection interfaces
- Lists that can be empty
- Async operations (loading states)

### Pattern: Empty/Filled/Error States
**UX**: Different icons, borders, colors, and actions for each state

**States**:
- **Empty**: Dashed border, add icon, prompt to add
- **Filled**: Solid border, content icon, show data with edit/remove actions
- **Error**: Red border, alert icon, error message

**Why It Works**:
- Clear visual feedback on current state
- Obvious next action for each state
- Reduces confusion

**Example from codebase**:
- **Shadow Links Certificate Upload** (`tls-configuration.tsx:76-144`)
  - Empty: Dashed border, FileUp icon, "Upload certificate" prompt
  - Filled: Solid border, Lock icon, shows filename with Remove button
  - Error: Red border, AlertTriangle icon, shows error message

### Pattern: Loading States
**UX**: Show spinner or skeleton while loading, then transition to content or empty state

**Example from codebase**:
- **Onboarding Wizard** (`onboarding-wizard.tsx`)
  - Shows `Spinner` while loading component specs
  - Transitions to content when ready

**Implementation Guidance**:
- Use `Spinner` component for loading
- Use dashed borders + `variant="ghost"` for empty states
- Use `text-destructive` class for error states
- Use `AnimatePresence` from motion for smooth transitions

---

## 8. Confirmation Patterns

### Principle
Prevent accidental destructive actions or data loss with confirmation dialogs that explain consequences.

### When to Use
- Destructive actions (delete, clear, overwrite)
- Actions that lose unsaved work
- Irreversible operations
- Mode switches that clear data

### Pattern: Confirmation Dialog for Destructive Actions
**UX**: User initiates action → check for impact → show dialog if needed → user confirms or cancels

**Why It Works**:
- Prevents accidental data loss
- Explains consequences clearly
- Gives users a chance to reconsider
- Required for good UX on destructive actions

**Example from codebase**:
- **Shadow Links Mode Switch** (`tls-configuration.tsx:411-428`)
  - Switching between upload/file-path modes
  - If certificates exist, shows confirmation dialog
  - Dialog explains "This will clear all existing certificates"
  - User can cancel or proceed

**Implementation Guidance**:
- Use `AlertDialog` component (not regular Dialog)
- **Title**: Ask question ("Switch certificate input method?")
- **Description**: Explain what will happen and consequences
- **Buttons**: Cancel (primary action, easy to hit) + Confirm (destructive)
- Check for impactful state before showing dialog
- Provide alternative if available ("Download certificates first")

**Component Pattern**:
```typescript
const [isPending, setIsPending] = useState(false);

const handleAction = () => {
  if (hasImpact) {
    setIsPending(true); // Show confirmation
  } else {
    executeAction(); // Safe, just do it
  }
};

<AlertDialog open={isPending} onOpenChange={setIsPending}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action will... [explain consequences]
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Confirm</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 9. Persistent State

### Principle
Preserve user progress across sessions. Don't lose work when users close the browser or navigate away.

### When to Use
- Multi-step workflows that take time
- Complex forms users may need to complete later
- Onboarding/setup flows
- Draft/in-progress content

### Pattern: Zustand with Persist Middleware
**UX**: User makes progress → closes browser → returns later → work is preserved

**Why It Works**:
- Reduces frustration from lost work
- Users can work across sessions
- Especially important for long/complex tasks
- Technical implementation is straightforward

**Example from codebase**:
- **RP Connect Onboarding** (`onboarding-wizard-store.ts`)
  - Wizard state persisted to localStorage
  - Includes connector selections, topic data, user data
  - Rehydrates on return
  - Cleared only when explicitly leaving wizard context

**Implementation Guidance**:
- Use Zustand with `persist` middleware
- Store in `localStorage` for cross-session
- Rehydrate on component mount
- Clear state when workflow completes or user explicitly abandons
- Be selective about what to persist (avoid sensitive data)

**When NOT to Persist**:
- Sensitive data (passwords, tokens)
- Data that may become stale (API responses with short TTL)
- Temporary UI state (which dialog is open)

---

## 10. Priority & Ordering

### Principle
Surface popular, featured, or recommended items first. Don't force users to search for common options.

### When to Use
- Large lists of options
- Some options are significantly more common
- New users benefit from guidance
- Reducing time to first success

### Pattern: Featured/Priority Items First
**UX**: Show priority items at top, then alphabetical or categorized remainder

**Why It Works**:
- Faster for common use cases
- Helpful for new users who don't know what to choose
- Doesn't hide other options
- Easy to implement

**Example from codebase**:
- **RP Connect Components** (`connect-tiles.tsx:30-46`)
  - `PRIORITY_COMPONENTS` array defines featured items
  - These appear first in grid regardless of filters
  - Common choices like 'redpanda', 'aws_s3', 'postgres_cdc' prioritized
  - Remaining components shown alphabetically

**Implementation Guidance**:
- Define priority list explicitly (array or config)
- Sort results: priority items first, then remaining by name/category
- Visually distinguish if appropriate (though not required)
- Update priority list based on usage data or feedback

**Ordering Strategies**:
1. **Priority + Alphabetical**: Featured first, rest A-Z
2. **Usage-Based**: Most used items first
3. **Contextual**: Different priorities for different use cases
4. **Category + Priority**: Group by category, prioritize within each

---

## Cross-Pattern Considerations

### Component Selection Guide

| Use Case | Pattern | Component |
|----------|---------|-----------|
| Binary toggle (on/off) | Progressive Disclosure | `Switch` |
| 3+ mutually exclusive options, all visible | Visual Selection | `RadioGroup` |
| Selecting from many visually distinct items | Visual Selection | `Choicebox` + tiles |
| Dropdown selection | - | `Select` |
| Multi-step process | Multi-Step Workflow | `defineStepper` or `WizardStepper` |
| Sidebar help/actions | Contextual Assistance | `Card` components |
| File upload | State Visualization | `Dropzone` |
| Confirming destructive action | Confirmation Pattern | `AlertDialog` |

### Testability

For all patterns, include test IDs following the convention:
- **Pattern**: `{component}-{element}-{type}`
- **Examples**:
  - `enable-tls-switch`
  - `ca-dropzone`
  - `add-connector-dialog`
  - `confirm-mode-change`

### Accessibility

All patterns should:
- Support keyboard navigation
- Include ARIA labels where appropriate
- Work with screen readers
- Have sufficient color contrast
- Not rely solely on color to convey information

UI Registry components handle most accessibility concerns automatically.

---

## When to Deviate from Patterns

These patterns are guidelines, not rules. Deviate when:
- User research shows a different approach works better for specific use case
- Technical constraints require adaptation
- New pattern emerges that's clearly superior

When deviating:
1. Document the rationale
2. Consider consistency impact
3. Validate with user testing if possible
4. Consider updating this skill if new pattern is successful

---

## Related Skills

- **improve-ux**: Use for systematic UX analysis of existing features
- **frontend-developer**: Use for implementing UIs with Redpanda UI Registry

---

## Pattern Evolution

As new patterns emerge:
1. Validate through real usage
2. Document with examples
3. Ensure consistency with existing patterns
4. Update this skill to share knowledge

Good patterns are discovered, validated, and shared—not invented in isolation.
