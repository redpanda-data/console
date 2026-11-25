function predecessorMap(gedges: { from: string; to: string }[]): Map<string, string[]> {
  const predecessors = new Map<string, string[]>();
  for (const edge of gedges) {
    const list = predecessors.get(edge.to);
    if (list) {
      list.push(edge.from);
    } else {
      predecessors.set(edge.to, [edge.from]);
    }
  }
  return predecessors;
}

// Forward longest-path rank (edge distance from the nearest source): nodes hug their predecessor
// (the split) instead of being pulled right to the merge. The cycle guard is defensive — it's a DAG.
export function forwardRanks(gnodes: { id: string }[], gedges: { from: string; to: string }[]): Map<string, number> {
  const predecessors = predecessorMap(gedges);
  const rank = new Map<string, number>();
  const inProgress = new Set<string>();
  const rankOf = (id: string): number => {
    const cached = rank.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (inProgress.has(id)) {
      return 0;
    }
    inProgress.add(id);
    // A source ranks 0; anything else sits one past its furthest predecessor.
    const value = Math.max(0, ...(predecessors.get(id) ?? []).map((p) => rankOf(p) + 1));
    inProgress.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const gn of gnodes) {
    rankOf(gn.id);
  }
  return rank;
}
