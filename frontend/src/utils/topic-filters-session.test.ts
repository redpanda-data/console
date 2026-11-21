import { clearAllTopicFilters, clearTopicFilters, getTopicFilters, setTopicFilters } from './topic-filters-session';
import { describe, expect, spyOn, test } from 'bun:test';
import { createFilterEntry } from '../types/topic-settings';

describe('topic filter session boundary', () => {
  test('round-trips complete filter state without losing code or inactive flags', () => {
    const filter = createFilterEntry({ id: 'filter', code: 'return false', isActive: false });
    setTopicFilters('events', [filter]);
    expect(getTopicFilters('events')).toEqual([filter]);
    clearTopicFilters('events');
    expect(getTopicFilters('events')).toEqual([]);
    clearAllTopicFilters();
  });

  test('reports malformed filter data and returns no forged FilterEntry values', () => {
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      sessionStorage.setItem('topic-filters', '{"events":[{"id":1}]}');
      expect(getTopicFilters('events')).toEqual([]);
      expect(warning).toHaveBeenCalledTimes(1);
    } finally {
      warning.mockRestore();
    }
  });
});
