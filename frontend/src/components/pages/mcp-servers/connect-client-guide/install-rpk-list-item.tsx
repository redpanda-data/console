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

import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { ListItem } from 'components/redpanda-ui/components/typography';
import { useState } from 'react';

const installMethods = [
  {
    id: 'homebrew',
    name: 'macOS - Homebrew',
    command: 'brew install redpanda-data/tap/redpanda',
  },
  {
    id: 'linux-amd64',
    name: 'Linux',
    command: `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-linux-amd64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH="~/.local/bin:$PATH" &&
  unzip rpk-linux-amd64.zip -d ~/.local/bin/`,
  },
  {
    id: 'macos-apple-silicon',
    name: 'macOS - Apple Silicon download',
    command: `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-darwin-arm64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH=$PATH:~/.local/bin &&
  unzip rpk-darwin-arm64.zip -d ~/.local/bin/`,
  },
  {
    id: 'macos-intel',
    name: 'macOS - Intel download',
    command: `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-darwin-amd64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH=$PATH:~/.local/bin &&
  unzip rpk-darwin-amd64.zip -d ~/.local/bin/`,
  },
];

export const InstallRpkListItem = () => {
  const [selectedMethod, setSelectedMethod] = useState<string>('homebrew');
  const selectedInstallMethod = installMethods.find((method) => method.id === selectedMethod);

  return (
    <ListItem>
      <div className="flex flex-col gap-2">
        <div>Install rpk:</div>
        <Label className="font-medium text-sm">Installation Method</Label>
        <div>
          <Select onValueChange={setSelectedMethod} value={selectedMethod}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Installation Method</SelectLabel>
                {installMethods.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {selectedInstallMethod?.command && <DynamicCodeBlock code={selectedInstallMethod?.command} lang="bash" />}
      </div>
    </ListItem>
  );
};
