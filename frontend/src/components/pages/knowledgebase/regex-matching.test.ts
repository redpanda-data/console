import { describe, expect, test } from 'bun:test';

// Test function for regex matching logic
function getMatchingTopics(pattern: string, allTopics: string[]): string[] {
  if (!pattern) return [];

  try {
    const regex = new RegExp(pattern);
    return allTopics.filter((topic) => regex.test(topic));
  } catch (_error) {
    // If regex is invalid, fall back to substring match
    return allTopics.filter((topic) => topic.toLowerCase().includes(pattern.toLowerCase()));
  }
}

describe('Topic Regex Matching', () => {
  const testTopics = ['confluence', 'incidents', '__redpanda.connect.logs'];

  test('should match confluence with conf.*', () => {
    const pattern = 'conf.*';
    const result = getMatchingTopics(pattern, testTopics);

    expect(result).toContain('confluence');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('confluence');
  });

  test('should match multiple topics starting with conf', () => {
    const topics = ['confluence', 'config', 'incidents', 'confirm'];
    const pattern = 'conf.*';
    const result = getMatchingTopics(pattern, topics);

    expect(result).toContain('confluence');
    expect(result).toContain('config');
    expect(result).toContain('confirm');
    expect(result).toHaveLength(3);
  });

  test('should match topics containing conf with .*conf.*', () => {
    const pattern = '.*conf.*';
    const result = getMatchingTopics(pattern, testTopics);

    expect(result).toContain('confluence');
    expect(result).toHaveLength(1);
  });

  test('should match exact topic names', () => {
    const pattern = 'incidents';
    const result = getMatchingTopics(pattern, testTopics);

    expect(result).toContain('incidents');
    expect(result).toHaveLength(1);
  });

  test('should handle invalid regex by falling back to substring', () => {
    const pattern = '[invalid';
    const result = getMatchingTopics(pattern, testTopics);

    // Should fall back to substring matching
    expect(result).toHaveLength(0); // No topics contain '[invalid'
  });

  test('should return empty array for empty pattern', () => {
    const result = getMatchingTopics('', testTopics);
    expect(result).toHaveLength(0);
  });

  test('should handle complex regex patterns', () => {
    const topics = ['test-topic-1', 'test-topic-2', 'prod-topic-1', 'dev-topic-1'];
    const pattern = 'test-topic-.*';
    const result = getMatchingTopics(pattern, topics);

    expect(result).toContain('test-topic-1');
    expect(result).toContain('test-topic-2');
    expect(result).toHaveLength(2);
  });

  // Test the specific case from the original issue
  test('should handle the exact case mentioned: conf.* matching confluence', () => {
    const topics = ['confluence', 'incidents', '__redpanda.connect.logs'];
    const pattern = 'conf.*';

    // Direct regex test
    const regex = new RegExp(pattern);
    expect(regex.test('confluence')).toBe(true);

    // Function test
    const result = getMatchingTopics(pattern, topics);
    expect(result).toEqual(['confluence']);
  });
});
