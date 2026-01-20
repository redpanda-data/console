---
title: Functional Components Only
impact: HIGH
impactDescription: Class components are deprecated patterns that make code harder to test and compose
tags: react, components, functional, hooks
---

# Functional Components Only (HIGH)

## Explanation

Always use functional components with hooks. Class components are a legacy pattern that makes code harder to test, compose, and optimize. Functional components are the modern React standard.

## Incorrect

```tsx
// Class component
class UserProfile extends React.Component<Props, State> {
  state = { loading: true };

  componentDidMount() {
    this.fetchUser();
  }

  render() {
    return <div>{this.state.loading ? 'Loading...' : this.props.name}</div>;
  }
}

// Nested component definition (causes remounting)
function Parent() {
  function Child() {
    return <div>Child</div>;
  }
  return <Child />; // Child remounts every render!
}

// Conditional hooks
function Component({ enabled }) {
  if (enabled) {
    const [state, setState] = useState(); // Rules of Hooks violation
  }
}
```

## Correct

```tsx
// Functional component
export function UserProfile({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(userId).then(data => {
      setUser(data);
      setLoading(false);
    });
  }, [userId]);

  if (loading) return <Skeleton />;

  return <div>{user?.name}</div>;
}

// Sibling components defined outside
function Parent() {
  return <Child />;
}

function Child() {
  return <div>Child</div>;
}

// Hooks always at top level
function Component({ enabled }: Props) {
  const [state, setState] = useState<string | null>(null);

  if (!enabled) return null;

  return <div>{state}</div>;
}
```

## Component Patterns

```tsx
// Named export (preferred)
export function FeatureComponent() { }

// Colocated sub-components
export function Feature() {
  return (
    <div>
      <FeatureHeader />
      <FeatureContent />
    </div>
  );
}

// Keep sub-components in same file if small
function FeatureHeader() { return <h1>Title</h1>; }
function FeatureContent() { return <p>Content</p>; }
```

## Reference

- [React Hooks](https://react.dev/reference/react/hooks)
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
