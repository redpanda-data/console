/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

const SECRET_REFERENCE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

export const extractSecretId = (raw: string | undefined): string => raw?.match(SECRET_REFERENCE_REGEX)?.[1] ?? '';

export const toSecretReference = (id: string): string => `\${secrets.${id}}`;
