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

import { Checkbox } from '@redpanda-data/ui';
import { motion } from 'framer-motion';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';

import { PageComponent, type PageInitHelper } from './Page';
import { AnimatePresence, animProps, MotionDiv } from '../../utils/animationProps';

@observer
export class UrlTestPage extends PageComponent {
  @observable test = true;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper) {
    p.title = 'DEBUG PLACEHOLDER';
  }

  render() {
    const p = this.props;
    return (
      <MotionDiv>
        <div>
          <h4>Path:</h4>
          <p>{p.matchedPath}</p>
        </div>

        <div>
          <h4>Query:</h4>
          <pre>{JSON.stringify(p.query, null, 4)}</pre>
        </div>

        <div>
          <h4>All Props:</h4>
          <pre>{JSON.stringify(p, null, 4)}</pre>
        </div>

        <div>
          <h4>Test</h4>
          <div>
            <Checkbox isChecked={this.test} onChange={(e) => (this.test = e.target.checked)}>
              Test Prop
            </Checkbox>
          </div>
          <AnimatePresence>
            {this.test ? (
              <motion.div
                key="a"
                {...animProps}
                style={{ padding: '2em 3em', borderRadius: '6px', background: '#f008' }}
              >
                <h3>The first test container</h3>
              </motion.div>
            ) : (
              <motion.div
                key="b"
                {...animProps}
                style={{ padding: '2em 3em', borderRadius: '6px', background: '#f608' }}
              >
                <h3>Another one! (This is the second container)</h3>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </MotionDiv>
    );
  }
}
