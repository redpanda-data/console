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

import { AclsStep } from '../create/configuration/acls-step';
import { ConsumerOffsetStep } from '../create/configuration/consumer-offset-step';
import { LegacySchemaRegistrySection } from '../create/configuration/schema-registry-step';
import { TopicsStep } from '../create/configuration/topics-step';

export const ShadowingTab = ({ schemaRegistryApiMode = false }: { schemaRegistryApiMode?: boolean }) => (
  <div className="space-y-4">
    <TopicsStep />
    <AclsStep />
    <ConsumerOffsetStep />
    {/* Always the legacy switch: the edit request builder can't express the
        version-gated API sync mode for now, only the create wizard can. */}
    <LegacySchemaRegistrySection readOnlyApiMode={schemaRegistryApiMode} />
  </div>
);
