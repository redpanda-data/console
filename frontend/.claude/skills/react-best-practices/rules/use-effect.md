# useEffect Rules

## Rule 1: Derive state, don't sync it

Most effects that setState from other state/props are unnecessary and add extra renders.

```tsx
// ❌ BAD: two render cycles — first stale, then filtered
function ProductList() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    setFilteredProducts(products.filter((p) => p.inStock));
  }, [products]);
}

// ✅ GOOD: compute inline in one render
function ProductList() {
  const [products, setProducts] = useState([]);
  const filteredProducts = products.filter((p) => p.inStock);
}
```

This also creates loop hazards:

```tsx
// ❌ BAD: total in deps can loop
useEffect(() => { setTotal(subtotal + tax); }, [subtotal, tax, total]);

// ✅ GOOD: no effects required
const total = subtotal + tax;
```

**Smell test:** You are about to write `useEffect(() => setX(deriveFromY(y)), [y])`, or state that only mirrors other state/props.

## Rule 2: Use data-fetching libraries

Effect-based fetching creates race conditions and duplicated caching logic.

```tsx
// ❌ BAD: race condition risk
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);
  useEffect(() => {
    fetchProduct(productId).then(setProduct);
  }, [productId]);
}

// ✅ GOOD: query library handles cancellation/caching/staleness
function ProductPage({ productId }) {
  const { data: product } = useQuery(['product', productId], () => fetchProduct(productId));
}
```

**Smell test:** Your effect does `fetch(...).then(setState)`, or you are re-implementing caching, retries, cancellation, or stale handling.

## Rule 3: Event handlers, not effects

If a user clicks a button, do the work in the handler — not via a state flag that triggers an effect.

```tsx
// ❌ BAD: effect as an action relay
function LikeButton() {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (liked) {
      postLike();
      setLiked(false);
    }
  }, [liked]);

  return <button onClick={() => setLiked(true)}>Like</button>;
}

// ✅ GOOD: direct event-driven action
function LikeButton() {
  return <button onClick={() => postLike()}>Like</button>;
}
```

**Smell test:** State is used as a flag so an effect can do the real action. You are building "set flag → effect runs → reset flag" mechanics.

## Rule 4: Mount effects for external sync only

`useEffect(..., [])` is appropriate for synchronizing with external systems: DOM integration, third-party widgets, browser API subscriptions. Use conditional mounting instead of guards inside effects.

```tsx
// ❌ BAD: guard inside effect
function VideoPlayer({ isLoading }) {
  useEffect(() => {
    if (!isLoading) playVideo();
  }, [isLoading]);
}

// ✅ GOOD: mount only when preconditions are met
function VideoPlayerWrapper({ isLoading }) {
  if (isLoading) return <LoadingScreen />;
  return <VideoPlayer />;
}

function VideoPlayer() {
  useEffect(() => playVideo(), []);
}

// ✅ ALSO GOOD: persistent shell + conditional instance
function VideoPlayerContainer({ isLoading }) {
  return (
    <>
      <VideoPlayerShell isLoading={isLoading} />
      {!isLoading && <VideoPlayerInstance />}
    </>
  );
}

function VideoPlayerInstance() {
  useEffect(() => playVideo(), []);
}
```

**Smell test:** You are synchronizing with an external system, and the behavior is naturally "setup on mount, cleanup on unmount."

## Rule 5: Reset with key, not dependency choreography

If the requirement is "start fresh when an ID changes," use React's remount semantics directly via the `key` prop. Avoid ref flags to gate one-time initialization.

```tsx
// ❌ BAD: effect attempts to emulate remount behavior
function VideoPlayer({ videoId }) {
  useEffect(() => {
    loadVideo(videoId);
  }, [videoId]);
}

// ✅ GOOD: key forces clean remount
function VideoPlayerWrapper({ videoId }) {
  return <VideoPlayer key={videoId} videoId={videoId} />;
}

function VideoPlayer({ videoId }) {
  useEffect(() => loadVideo(videoId), []);
}
```

```tsx
// ❌ BAD: ref flag choreography
const hasInit = useRef(false);
useEffect(() => {
  if (!hasInit.current) {
    init();
    hasInit.current = true;
  }
}, [dep]);

// ✅ GOOD: adjust state during render (React-supported pattern)
const [hasInit, setHasInit] = useState(false);
if (dep && !hasInit) {
  setHasInit(true);
  init();
}
```

**Smell test:** You are writing an effect whose only job is to reset local state when an ID/prop changes. You want the component to behave like a brand-new instance for each entity. Or you are using a ref as a gate to run code "only once" inside an effect.

## Rule 6: No infinite loop risks

- Never put a non-memoized function in the dependency array — wrap with `useCallback`
- Never put inline objects/arrays in the dependency array — wrap with `useMemo`
- If the linter requires a `biome-ignore` for exhaustive deps, the effect likely needs restructuring

```tsx
// ❌ BAD: function recreated every render → infinite loop
function MyComponent() {
  function doSomething() { /* ... */ }
  useEffect(() => { doSomething(); }, [doSomething]);
}

// ✅ GOOD: memoize with useCallback
function MyComponent() {
  const doSomething = useCallback(() => { /* ... */ }, []);
  useEffect(() => { doSomething(); }, [doSomething]);
}

// ❌ BAD: inline object always "different"
useEffect(() => { /* ... */ }, [{ key: value }]);

// ✅ GOOD: stable reference
const config = useMemo(() => ({ key: value }), [value]);
useEffect(() => { /* ... */ }, [config]);
```
