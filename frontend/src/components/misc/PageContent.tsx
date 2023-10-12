import { ReactNode } from 'react';
import { Stack } from '@redpanda-data/ui';
import { motion } from 'framer-motion';
import { animProps } from '../../utils/animationProps';

export type PageContentProps = {
  children: ReactNode;
  className?: string;
}

function PageContent(props: PageContentProps) {
  return (
    <motion.div {...animProps} className={props.className}>
      <Stack gap={3}>
        {props.children}
      </Stack>
    </motion.div>
  )
}

export default PageContent;
