import React, { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import classNames from 'classnames';

import icon from '../../icon';

import styles from './GraphInfoPanel.module.css';

export default function GraphInfoPanel({
  children,
  show,
  close,
}: {
  children: any;
  show: boolean;
  close: () => void;
}) {
  // Used by editor window for expanding the view
  const [widerView, setWiderView] = useState(localStorage.getItem('node-view-expanded') === 'true');

  useEffect(() => {
    localStorage.setItem('node-view-expanded', widerView ? 'true' : 'false');
  }, [ widerView ]);

  const toggleWiderView = useCallback(() => {
    setWiderView(!widerView);
  }, [ setWiderView, widerView ]);

  return <div className={clsx(styles.runViewWindow, widerView ? styles.nodeViewBoxWide : styles.nodeViewBoxNarrow)} style={{ display: show ? 'flex' : 'none' }}>
    <button onClick={toggleWiderView} className={styles.expandHandle}>{widerView ? '>' : '<'}</button>
    <div className={styles.nodeViewContent}>
      {children}
    </div>
    <button title="close" className={classNames('bstdioEmojiBtn', styles.closeBtn)} onClick={() => close()}>{icon.close}</button>
  </div>;
}
