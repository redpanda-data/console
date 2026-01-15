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

import { Link } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { ArrowLeft } from 'lucide-react';

export const AIAgentBackButton = () => (
  <Link to="/agents">
    <Button className="gap-2" size="sm" variant="ghost">
      <ArrowLeft className="h-4 w-4" />
      Back to AI Agents
    </Button>
  </Link>
);
