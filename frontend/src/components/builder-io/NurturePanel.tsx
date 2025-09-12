/**
 * https://www.builder.io/c/docs/integrate-section-building
 * https://www.builder.io/c/blueprints/announcement-bar
 * src/components/AnnouncementBar.tsx
 */
import { type BuilderContent, Content, fetchOneEntry, isPreviewing } from '@builder.io/sdk-react';
import { Box, Skeleton, Text } from '@redpanda-data/ui';
import { builderCustomComponents } from 'components/builder-io/builderCustomComponents';
import { BUILDER_API_KEY } from 'components/constants';
import { useEffect, useState } from 'react';
import { api } from 'state/backendApi';

export default function NurturePanel() {
  const platform = api.isRedpanda ? 'redpanda' : 'kafka';

  const MODEL_NAME = `console-nurture-panel-${platform}`;

  const [content, setContent] = useState<BuilderContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    fetchOneEntry({
      model: MODEL_NAME,
      apiKey: BUILDER_API_KEY,
      userAttributes: {
        urlPath: window.location.pathname,
        platform,
      },
    })
      .then((content) => {
        if (content) {
          setContent(content);
        }
        setHasError(false);
      })
      .catch((err) => {
        console.log('Oops: ', err);
        setHasError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [platform, MODEL_NAME]);

  const shouldRenderBuilderContent = content || isPreviewing();

  if (isLoading) {
    return (
      <Box>
        <Skeleton height={4} width="80%" mb={1} />
        <Skeleton height={3} width="32%" mb={4} />

        <Skeleton height={4} width="70%" mb={1} />
        <Skeleton height={3} width="28%" mb={4} />

        <Skeleton height={4} width="90%" mb={1} />
        <Skeleton height={3} width="60%" />
        <Skeleton height={3} width="40%" mb={4} />

        <Box borderBottom="1px" borderColor="gray.200" mt={2} />
      </Box>
    );
  }

  if (hasError || (!content && !isPreviewing())) {
    return (
      <Box>
        <Text>No updates available</Text>
      </Box>
    );
  }

  return (
    <>
      {shouldRenderBuilderContent ? (
        <Content
          content={content}
          model={MODEL_NAME}
          apiKey={BUILDER_API_KEY}
          customComponents={builderCustomComponents}
        />
      ) : null}
    </>
  );
}
