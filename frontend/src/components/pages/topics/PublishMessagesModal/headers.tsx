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

import './headersEditor.scss';
import { Button, Input } from '@redpanda-data/ui';
import { PlusIcon, TrashIcon } from 'components/icons';

type Header = {
  id: string;
  key: string;
  value: string;
};

export type Props = {
  items: Header[];
  onChange: (items: Header[]) => void;
};

const HeadersEditor = (p: Props): JSX.Element => (
  <div className="headersEditor">
    <table>
      <thead>
        <tr>
          <th className="index">#</th>
          <th className="name">Header Name</th>
          <th className="value">Value</th>
          <th className="actions">Action</th>
        </tr>
      </thead>
      <tbody>
        {p.items.map((h, i) => (
          <HeaderComp
            header={h}
            index={i}
            key={h.id}
            onDelete={() => p.onChange(p.items.filter((_, idx) => idx !== i))}
            onUpdate={(updated) => p.onChange(p.items.map((item, idx) => (idx === i ? updated : item)))}
          />
        ))}
      </tbody>
    </table>
    <Button
      onClick={() => {
        p.onChange([...p.items, { id: crypto.randomUUID(), key: '', value: '' }]);
      }}
      variant="outline"
      width="100%"
    >
      <span style={{ opacity: 0.66 }}>
        <PlusIcon size="small" />
      </span>
      Add Row
    </Button>
  </div>
);

export default HeadersEditor;

const HeaderComp = (p: { header: Header; index: number; onUpdate: (header: Header) => void; onDelete: () => void }) => {
  const { key, value } = p.header;
  return (
    <tr>
      <td className="index">{p.index + 1}</td>
      <td className="name">
        <Input
          borderRightRadius="0"
          onChange={(e) => {
            p.onUpdate({ ...p.header, key: e.target.value });
          }}
          placeholder="Key"
          spellCheck={false}
          value={key}
        />
      </td>
      <td className="value">
        <Input
          onChange={(e) => {
            p.onUpdate({ ...p.header, value: e.target.value });
          }}
          placeholder="Value"
          spellCheck={false}
          value={value}
        />
      </td>
      <td className="actions">
        <Button
          className="iconButton"
          onClick={(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            event.stopPropagation();
            p.onDelete();
          }}
          variant="ghost"
        >
          <TrashIcon size={20} />
        </Button>
      </td>
    </tr>
  );
};
