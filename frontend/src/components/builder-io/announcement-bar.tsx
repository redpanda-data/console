import { type BuilderContent, Content, fetchOneEntry, isPreviewing } from '@builder.io/sdk-react';
import { builderCustomComponents } from 'components/builder-io/builder-custom-components';
import { BUILDER_API_KEY } from 'components/constants';
import { isEmbedded } from 'config';
import { useEffect, useState } from 'react';

const MODEL_NAME = 'console-announcement-bar';

export default function AnnouncementBar() {
  const [content, setContent] = useState<BuilderContent | null>(null);

  const embedded = isEmbedded();

  useEffect(() => {
    if (embedded) {
      return;
    }

    fetchOneEntry({
      model: MODEL_NAME,
      apiKey: BUILDER_API_KEY,
      userAttributes: {
        urlPath: window.location.pathname,
      },
    })
      .then((fetchedContent) => {
        if (fetchedContent) {
          setContent(fetchedContent);
        }
      })
      .catch((error) => {
        // biome-ignore lint/suspicious/noConsole: error logging for debugging fetch failures
        console.error('Failed to fetch announcement bar content:', error);
      });
  }, [embedded]);

  if (embedded) {
    return null;
  }

  const shouldRenderBuilderContent = content || isPreviewing();

  return shouldRenderBuilderContent
    ? content && (
        <Content
          apiKey={BUILDER_API_KEY}
          content={content}
          customComponents={builderCustomComponents}
          enrich={false}
          model={MODEL_NAME}
        />
      )
    : null;
}
