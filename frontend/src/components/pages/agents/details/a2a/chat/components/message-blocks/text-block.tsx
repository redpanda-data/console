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

import { Response } from 'components/ai-elements/response';

type TextBlockProps = {
  text: string;
  timestamp?: Date;
};

/**
 * Renders a text content block (Jupyter-style cell)
 * Displays text segment from the agent's response
 */
export const TextBlock = ({ text }: TextBlockProps) => <Response>{text}</Response>;
