import { useState } from 'react';

/** Open state of a dialog plus a key that changes on every open, so each opening starts from a fresh form. */
export function useRemountingDialog() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  const show = () => {
    setKey((k) => k + 1);
    setOpen(true);
  };

  return { open, setOpen, key, show };
}
