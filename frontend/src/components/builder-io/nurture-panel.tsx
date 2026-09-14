/**
 * Builder.io nurture panel component.
 * Displays resources and updates for the overview page.
 * Only used in standalone mode - not imported in federated/embedded routes.
 *
 * @see https://www.builder.io/c/docs/integrate-section-building
 * @see https://www.builder.io/c/blueprints/announcement-bar
 */
import { type BuilderContent, Content, fetchOneEntry, isPreviewing } from '@builder.io/sdk-react';
import { builderCustomComponents } from 'components/builder-io/builder-custom-components';
import { BUILDER_API_KEY } from 'components/constants';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { isEmbedded } from 'config';
import { useEffect, useState } from 'react';
import { api } from 'state/backend-api';

/**
 * NurturePanel displays Builder.io content for resources and updates.
 * Returns null in embedded mode - use conditional rendering at the route level
 * to avoid loading Builder.io dependencies in federated bundles.
 */
export default function NurturePanel() {
  const embedded = isEmbedded();
  const platform = api.isRedpanda ? 'redpanda' : 'kafka';
  const MODEL_NAME = `console-nurture-panel-${platform}`;

  const [fetchState, setFetchState] = useState<{
    content: BuilderContent | null;
    isLoading: boolean;
    hasError: boolean;
  }>({ content: null, isLoading: !embedded, hasError: false });

  const { content, isLoading, hasError } = fetchState;

  useEffect(() => {
    if (embedded) {
      return;
    }

    fetchOneEntry({
      model: MODEL_NAME,
      apiKey: BUILDER_API_KEY,
      userAttributes: {
        urlPath: window.location.pathname,
        platform,
      },
    })
      .then((fetchedContent) => {
        setFetchState({ content: fetchedContent ?? null, isLoading: false, hasError: false });
      })
      .catch(() => {
        setFetchState((prev) => ({ ...prev, isLoading: false, hasError: true }));
      });
  }, [platform, MODEL_NAME, embedded]);

  // Early return for embedded mode - Builder.io content not needed
  if (embedded) {
    return null;
  }

  const shouldRenderBuilderContent = content || isPreviewing();

  if (isLoading) {
    return (
      <>
        <NurtureItemSkeleton />
        <NurtureItemSkeleton />
      </>
    );
  }

  if (hasError || !(content || isPreviewing())) {
    return <p className="text-body">No updates available</p>;
  }

  return (
    <>
      {shouldRenderBuilderContent ? (
        <Content
          apiKey={BUILDER_API_KEY}
          content={content}
          customComponents={builderCustomComponents}
          enrich={false}
          model={MODEL_NAME}
        />
      ) : null}
    </>
  );
}

const NurtureItemSkeleton = () => (
  <div className="flex items-start">
    {/* Left thumbnail placeholder */}
    <Skeleton className="mr-4 h-20 w-[120px]" />

    {/* Right content */}
    <div className="flex-1">
      {/* Heading */}
      <Skeleton className="mb-2 h-4 w-[60%]" />

      {/* Paragraph */}
      <Skeleton className="mb-1 h-3 w-[90%]" />
      <Skeleton className="h-3 w-[75%]" />
    </div>
  </div>
);
