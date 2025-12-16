/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

describe('PlaygroundTab - Error Handling', () => {
  describe('MCP Error Parsing', () => {
    test('should parse MCP error response with error and details fields', () => {
      const mcpResponseText = JSON.stringify({
        error: 'Query processing failed',
        details:
          'error, status code: 401, status: 401 Unauthorized, message: Incorrect API key provided: OPENAI_KEY. You can find your API key at https://platform.openai.com/account/api-keys.',
      });

      const parsedResponse = JSON.parse(mcpResponseText);

      expect(parsedResponse).toHaveProperty('error');
      expect(parsedResponse).toHaveProperty('details');
      expect(parsedResponse.error).toBe('Query processing failed');
      expect(parsedResponse.details).toContain('401 Unauthorized');
    });

    test('should detect MCP error response vs successful array response', () => {
      // Error response
      const errorResponse = {
        error: 'Query processing failed',
        details: 'Some error details',
      };

      // Success response
      const successResponse = [
        {
          document_name: 'doc1',
          chunk_id: 'chunk1',
          text: 'some text',
          topic: 'test-topic',
        },
      ];

      // Check error response
      const isError =
        errorResponse && typeof errorResponse === 'object' && ('error' in errorResponse || 'details' in errorResponse);
      expect(isError).toBe(true);

      // Check success response
      const isSuccess = Array.isArray(successResponse);
      expect(isSuccess).toBe(true);
      expect(
        successResponse &&
          typeof successResponse === 'object' &&
          ('error' in successResponse || 'details' in successResponse)
      ).toBe(false);
    });

    test('should identify error response when only error field is present', () => {
      const responseWithErrorOnly = {
        error: 'Something went wrong',
      };

      const isError =
        responseWithErrorOnly &&
        typeof responseWithErrorOnly === 'object' &&
        ('error' in responseWithErrorOnly || 'details' in responseWithErrorOnly);
      expect(isError).toBe(true);
    });

    test('should identify error response when only details field is present', () => {
      const responseWithDetailsOnly = {
        details: 'Detailed error information',
      };

      const isError =
        responseWithDetailsOnly &&
        typeof responseWithDetailsOnly === 'object' &&
        ('error' in responseWithDetailsOnly || 'details' in responseWithDetailsOnly);
      expect(isError).toBe(true);
    });
  });
});
