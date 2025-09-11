/**
 * https://www.builder.io/c/docs/integrate-section-building
 * https://www.builder.io/c/blueprints/announcement-bar
 * src/components/AnnouncementBar.tsx
 */
import {
  Content,
  fetchOneEntry,
  isPreviewing,
  type BuilderContent,
} from '@builder.io/sdk-react';
import { builderCustomComponents } from 'components/builder-io/builderCustomComponents';
import { useEffect, useState } from 'react';
import env from 'utils/env';

const MODEL_NAME = 'console-nurture-panel';

export default function NurturePanel() {
  const [content, setContent] = useState<BuilderContent | null>(null);

  useEffect(() => {
    fetchOneEntry({
      model: MODEL_NAME,
      apiKey: env.REACT_APP_BUILDER_API_KEY,
      userAttributes: {
        urlPath: window.location.pathname,
      },
    })
      .then((content) => {
        if (content) {
          setContent(content);
        }
      })
      .catch((err) => {
        console.log('Oops: ', err);
      });
  }, []);

  const shouldRenderBuilderContent = content || isPreviewing();

  return <>
    {
      shouldRenderBuilderContent ? (
        <Content
          content={content}
          model={MODEL_NAME}
          apiKey={env.REACT_APP_BUILDER_API_KEY}
          customComponents={builderCustomComponents}
        />
      ) : null}
  </>
}