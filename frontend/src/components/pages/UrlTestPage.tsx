import React from "react";
import { Section } from "../misc/common";
import { PageComponent, PageInitHelper } from "./Page";

import { motion, AnimatePresence } from "framer-motion"
import { animProps, MotionDiv } from "../../utils/animationProps";
import { observer } from "mobx-react";
import { Checkbox } from "antd";
import { observable } from "mobx";

@observer
export class UrlTestPage extends PageComponent {

    @observable test: boolean = true;

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
                    <div><Checkbox checked={this.test} onChange={e => this.test = e.target.checked}>Test Prop</Checkbox></div>
                    <AnimatePresence >

                        {this.test

                            ? <motion.div key='a' {...animProps} style={{ padding: '2em 3em', borderRadius: '6px', background: '#f008' }}>
                                <h3>The first test container</h3>
                            </motion.div>

                            : <motion.div key='b' {...animProps} style={{ padding: '2em 3em', borderRadius: '6px', background: '#f608' }} >
                                <h3>Another one! (This is the second container)</h3>
                            </motion.div>

                        }
                    </AnimatePresence>
                </div>


            </MotionDiv>
        );
    }
}
