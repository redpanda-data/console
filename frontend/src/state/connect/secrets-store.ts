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

import { Secret } from './secret';

export class SecretsStore {
  _data = new Map<string, Secret>();

  getSecret(key: string) {
    let secret = this._data.get(key);

    if (!secret) {
      secret = new Secret(key);
      this._data.set(key, secret);
    }
    return secret;
  }

  get ids() {
    return Array.from(this.secrets, ([_key, secret]) => secret.id).filter((secret): secret is string =>
      Boolean(secret)
    );
  }

  get secrets() {
    const result = new Map<string, Secret>();
    for (const [key, secret] of this._data) {
      if (secret.value && secret.value.trim() !== '') {
        result.set(key, secret);
      }
    }
    return result;
  }
}
