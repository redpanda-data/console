import { parseJsonSchema } from './json-schema';
import { describe, expect, test } from 'bun:test';

describe('parseJsonSchema', () => {
  test('keeps nested schemas, boolean branches and extension keywords', () => {
    const schema = {
      definitions: { credentials: { type: 'object', properties: { password: { type: 'string', is_secret: true } } } },
      properties: { auth: { anyOf: [{ $ref: '#/definitions/credentials' }, false] }, enabled: true },
      dependencies: { auth: ['enabled'] },
      items: [{ type: 'string' }, false],
      defaultSnippets: [{ body: { auth: {} }, suggestionKind: 15 as const }],
      'x-owner': 'connect',
    };
    expect(parseJsonSchema(schema)).toEqual(schema);
  });

  test.each(
    [
      null,
      [],
      { properties: { auth: { required: 'password' } } },
      { definitions: { auth: false } },
      { items: [{ minimum: 'zero' }] },
      { defaultSnippets: [{ suggestionKind: 26 }] },
      { schemaSequence: [{ doNotSuggest: 'yes' }] },
    ].map((value) => ({ value }))
  )('rejects malformed known fields: %j', ({ value }) => {
    expect(parseJsonSchema(value)).toBeUndefined();
  });
});
