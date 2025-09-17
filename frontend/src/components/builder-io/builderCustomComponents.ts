// your-custom-components.ts (React version)
import type { RegisteredComponent } from '@builder.io/sdk-react';
import { Banner, BannerClose, BannerContent } from 'components/redpanda-ui/components/banner';

export const builderCustomComponents: RegisteredComponent[] = [
  {
    component: Banner,
    name: 'Banner',
    inputs: [
      {
        name: 'id',
        type: 'string',
      },
    ],
    canHaveChildren: true,
  },
  {
    component: BannerContent,
    name: 'BannerContent',
    canHaveChildren: true,
  },
  {
    component: BannerClose,
    name: 'BannerClose',
  },
];
