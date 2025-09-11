import { useEffect, useState } from "react";
import { type BuilderContent, Content, fetchOneEntry, isPreviewing } from '@builder.io/sdk-react';
import { builderCustomComponents } from 'components/builder-io/builderCustomComponents';
import env from 'utils/env';

const MODEL_NAME = 'console-announcement-bar';

export default function AnnouncementBar() {
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
      .catch((error) => {
        console.error(error)
      });
  }, []);

  const shouldRenderBuilderContent = content || isPreviewing();

  return shouldRenderBuilderContent
    ? content && (
        <Content
          content={content}
          model={MODEL_NAME}
          apiKey={env.REACT_APP_BUILDER_API_KEY}
          customComponents={builderCustomComponents}
        />
      )
    : null;
}