import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { animProps } from '../../utils/animation-props';

export type PageContentProps = {
  children: ReactNode;
  className?: string;
};

function PageContent(props: PageContentProps) {
  return (
    <motion.div {...animProps} className={props.className}>
      <div className="flex flex-col gap-3">{props.children}</div>
    </motion.div>
  );
}

export default PageContent;
