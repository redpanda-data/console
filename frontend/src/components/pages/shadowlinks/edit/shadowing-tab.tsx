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

import { SchemaRegistryEditSection } from './schema-registry-edit-section';
import { AclsStep } from '../create/configuration/acls-step';
import { ConsumerOffsetStep } from '../create/configuration/consumer-offset-step';
import { TopicsStep } from '../create/configuration/topics-step';
import { SCHEMA_REGISTRY_MODE, type SchemaRegistryMode } from '../create/model';

export const ShadowingTab = ({
  schemaRegistryOriginalMode = SCHEMA_REGISTRY_MODE.NONE,
}: {
  schemaRegistryOriginalMode?: SchemaRegistryMode;
}) => (
  <div className="space-y-4">
    <TopicsStep />
    <AclsStep />
    <ConsumerOffsetStep />
    <SchemaRegistryEditSection originalMode={schemaRegistryOriginalMode} />
  </div>
);
