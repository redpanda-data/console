/**
 * https://www.builder.io/c/docs/integrate-section-building
 * https://www.builder.io/c/blueprints/announcement-bar
 * src/components/AnnouncementBar.tsx
 */
import { type BuilderContent, Content, fetchOneEntry, isPreviewing } from '@builder.io/sdk-react';
import { Box, Skeleton, Text } from '@redpanda-data/ui';
import { builderCustomComponents } from 'components/builder-io/builder-custom-components';
import { BUILDER_API_KEY } from 'components/constants';
import { useEffect, useState } from 'react';
import { api } from 'state/backend-api';

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
      .then((fetchedContent) => {
        if (fetchedContent) {
          setContent(fetchedContent);
        }
        setHasError(false);
      })
      .catch(() => {
        setHasError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [platform, MODEL_NAME]);

  const shouldRenderBuilderContent = content || isPreviewing();

  if (isLoading) {
    return (
      <>
        <Box alignItems="flex-start" display="flex">
          {/* Left thumbnail placeholder */}
          <Skeleton borderRadius="md" height="80px" mr={4} width="120px" />

          {/* Right content */}
          <Box flex="1">
            {/* Heading */}
            <Skeleton height={4} mb={2} width="60%" />

            {/* Paragraph */}
            <Skeleton height={3} mb={1} width="90%" />
            <Skeleton height={3} width="75%" />
          </Box>
        </Box>
        <Box alignItems="flex-start" display="flex">
          {/* Left thumbnail placeholder */}
          <Skeleton borderRadius="md" height="80px" mr={4} width="120px" />

          {/* Right content */}
          <Box flex="1">
            {/* Heading */}
            <Skeleton height={4} mb={2} width="60%" />

            {/* Paragraph */}
            <Skeleton height={3} mb={1} width="90%" />
            <Skeleton height={3} width="75%" />
          </Box>
        </Box>
      </>
    );
  }

  if (hasError || !(content || isPreviewing())) {
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
          apiKey={BUILDER_API_KEY}
          content={content}
          customComponents={builderCustomComponents}
          model={MODEL_NAME}
        />
      ) : null}
    </>
  );
}
