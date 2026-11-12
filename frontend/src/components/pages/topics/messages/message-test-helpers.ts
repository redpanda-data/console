import type { Payload, TopicMessage } from '../../../../state/rest-interfaces';

const emptyPayload = (): Payload => ({
  payload: null,
  isPayloadNull: true,
  encoding: 'null',
  schemaId: 0,
  size: 0,
});

/** Complete live-message contract; callers override only the behavior their test exercises. */
export function createTopicMessage(overrides: Partial<TopicMessage> = {}): TopicMessage {
  return {
    partitionID: 0,
    offset: 0,
    timestamp: 0,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: emptyPayload(),
    value: emptyPayload(),
    keyJson: '',
    valueJson: '',
    ...overrides,
  };
}
