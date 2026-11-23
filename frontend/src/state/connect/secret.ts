/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { encodeBase64 } from '../../utils/utils';

// Regex for validating secret strings
const SECRET_STRING_REGEX = /^\$\{secretsManager:[A-Za-z\-0-9]+:.+\}$/u;

export class Secret {
  key: string;
  value: string;
  id: string | null = null;
  secretString: string | null = null;
  isDirty = false;
  private listeners: Set<() => void> = new Set();

  constructor(key: string) {
    this.key = key;
  }

  // Manual reactivity - call this when value or secretString changes
  private notifyListeners() {
    if (this.secretString && this.value) {
      this.isDirty = this.value !== this.secretString;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setValue(newValue: string) {
    this.value = newValue;
    this.notifyListeners();
  }

  setSecretString(newSecretString: string) {
    this.secretString = newSecretString;
    this.notifyListeners();
  }

  get serialized() {
    return encodeBase64(JSON.stringify({ [this.key]: this.value }));
  }

  get toJS() {
    return {
      [this.key]: this.value,
    };
  }

  getSecretString(key: string, id?: string) {
    const _id = id ?? this.id;
    if (_id) {
      return `\${secretsManager:${_id}:${key}}`;
    }
    return null;
  }

  extractSecretId(secretString: string) {
    if (!this.validateSecretString(secretString)) {
      return false;
    }
    this.id = String(secretString).split(':')[1];
    return !!this.id;
  }

  validateSecretString(secretString: string) {
    const validationResult = SECRET_STRING_REGEX.test(secretString);
    if (validationResult) {
      this.secretString = secretString;
    }
    return validationResult;
  }
}
