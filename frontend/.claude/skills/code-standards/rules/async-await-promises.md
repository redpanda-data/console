---
title: Async/Await Over Promise Chains
impact: HIGH
impactDescription: async/await is more readable and makes error handling explicit
tags: async, await, promises, javascript
---

# Async/Await Over Promise Chains (HIGH)

## Explanation

Use `async/await` instead of `.then()` chains. Async/await is more readable, makes error handling explicit, and avoids callback hell. Never leave promises floating without handling.

## Incorrect

```typescript
// Promise chains
function loadData() {
  fetchUser()
    .then(user => fetchPosts(user.id))
    .then(posts => processPosts(posts))
    .catch(error => handleError(error));
}

// Floating promise (no await)
function save() {
  saveToDatabase(data); // Promise returned but not awaited!
}

// Async in Promise executor
new Promise(async (resolve) => {
  const data = await fetch(url);
  resolve(data);
});

// Mixing patterns
async function mixed() {
  return fetch(url).then(res => res.json());
}
```

## Correct

```typescript
// async/await
async function loadData() {
  try {
    const user = await fetchUser();
    const posts = await fetchPosts(user.id);
    return processPosts(posts);
  } catch (error) {
    handleError(error);
  }
}

// Always await or return promises
async function save() {
  await saveToDatabase(data);
}

// Parallel execution when needed
async function loadAll() {
  const [users, posts] = await Promise.all([
    fetchUsers(),
    fetchPosts(),
  ]);
  return { users, posts };
}

// Consistent async/await
async function fetchJson(url: string) {
  const response = await fetch(url);
  return response.json();
}
```

## Error Handling

```typescript
// Explicit try/catch
async function riskyOperation() {
  try {
    const result = await mightFail();
    return result;
  } catch (error) {
    // Log and rethrow or handle
    console.error('Operation failed:', error);
    throw error;
  }
}

// Error boundaries for React
<ErrorBoundary fallback={<ErrorFallback />}>
  <AsyncComponent />
</ErrorBoundary>
```

## Reference

- [MDN async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises)
