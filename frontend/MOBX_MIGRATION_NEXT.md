# MobX Migration - Next Steps

## Quick Stats
- **Completed:** 61/94 component files (65%) + 5 state files
- **Remaining:** 33 component files
- **Status:** ✅ All tests passing, types valid

## Suggested Next Targets (Easiest First)

### Quick Wins - Simple Observer Wrappers (1 file)

- pages/mcp-servers/details/remote-mcp-logs-tab.tsx ⚠️ (streaming via MobX — needs `useEffect`/callback approach, not a simple removal)

### Medium Complexity - Class Components / @observable Fields (17 files)

**Reassign Partitions (inline observer() in cells + MobX observable array props — do with parent):**
- pages/reassign-partitions/components/active-reassignments.tsx
- pages/reassign-partitions/components/statistics-bar.tsx
- pages/reassign-partitions/step1-partitions.tsx
- pages/reassign-partitions/step2-brokers.tsx

**Connect Dynamic UI:**
- pages/connect/dynamic-ui/components.tsx
- pages/connect/dynamic-ui/connector-step.tsx
- pages/connect/dynamic-ui/list.tsx
- pages/connect/dynamic-ui/property-component.tsx
- pages/connect/dynamic-ui/property-group.tsx
- pages/connect/dynamic-ui/debug-editor.tsx
- pages/connect/helper.tsx
- pages/connect/create-connector.tsx

**Other:**
- pages/overview/overview.tsx (454 lines)
- pages/transforms/transform-details.tsx (394 lines)

### Hard - Large Files or Complex State (16 files)

**Very Large Files:**
- pages/consumers/modals.tsx ⚠️ (1125 lines)
- pages/connect/connector-details.tsx ⚠️ (856 lines)
- pages/reassign-partitions/reassign-partitions.tsx ⚠️ (863 lines)
- pages/schemas/schema-create.tsx ⚠️ (843 lines)
- pages/topics/topic-produce.tsx (691 lines)
- pages/consumers/group-details.tsx (641 lines)
- pages/topics/topic-details.tsx (483 lines)

**useLocalObservable / Complex State:**
- misc/user-preferences.tsx (338 lines, useLocalObservable)
- pages/topics/topic-configuration.tsx (observer() + useLocalObservable)

**ACL - Class Components:**
- pages/acls/principal-group-editor.tsx
- pages/acls/role-details.tsx
- pages/acls/role-edit-page.tsx
- pages/acls/role-form.tsx

**Topic - Tricky Patterns:**
- pages/topics/PublishMessagesModal/headers.tsx (observer() x2, direct array mutations)
- pages/topics/tab-config.tsx (@observer, @computed, makeObservable())

**Misc:**
- misc/kowl-table.tsx
- misc/kowl-time-picker.tsx
- misc/login.tsx

## Migration Checklist

For each file:
1. [ ] Read the file to understand MobX usage
2. [ ] Identify patterns: `@observer`, `observer()`, `useLocalObservable`, `@observable`
3. [ ] Convert based on pattern:
   - `observer()` wrapper only → Remove wrapper
   - `@observable` fields → `useState`
   - `useLocalObservable` → `useState` with object
   - Class component → Keep PageComponent wrapper, extract functional component
4. [ ] Update all state setters to use functional updates
5. [ ] Run `bun run type:check`
6. [ ] Run `bun run lint`
7. [ ] Test the page manually if possible
8. [ ] Update MOBX_MIGRATION_STATUS.md

## Pattern Reference

### Pattern 1: Simple Observer Wrapper
```typescript
// BEFORE
const MyComponent = observer((props) => {
  return <div>{api.someData}</div>;
});

// AFTER
const MyComponent = (props) => {
  return <div>{api.someData}</div>;
};
```

### Pattern 2: Class with Observable State
```typescript
// BEFORE
@observer
class MyComponent extends Component {
  @observable value = '';

  constructor(props) {
    super(props);
    makeObservable(this);
  }
}

// AFTER
function MyComponent(props) {
  const [value, setValue] = useState('');
}
```

### Pattern 3: useLocalObservable (admin-debug-bundle pattern)
```typescript
// BEFORE
const formState = useLocalObservable(() => ({
  field1: 'value',
  field2: 0,
  setField1(v) { this.field1 = v; },
}));

// AFTER
const [formState, setFormState] = useState({
  field1: 'value',
  field2: 0,
});
// Use: setFormState(prev => ({ ...prev, field1: newValue }))
```

## Quick Commands

```bash
# List remaining files
grep -l "@observer\|observer(\|useLocalObservable" src/components/**/*.tsx | sort

# Check specific file
grep -n "@observer\|observer(\|useLocalObservable" src/components/path/to/file.tsx

# After changes
bun run type:check && bun run lint
```

## Notes

- Start with quick wins to build momentum
- Avoid touching very large files (500+ lines) early on
- Test after every 5-10 files
- Keep the api.* access pattern for now (data layer separate)
- PageComponent wrapper can stay - just extract render() to functional component

**Last Updated:** 2026-03-03 (Session 6 — 61/94 done)
