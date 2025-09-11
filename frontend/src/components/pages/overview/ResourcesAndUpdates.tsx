import { Box, Button, Flex, Link, Skeleton, Text } from '@redpanda-data/ui';
import React from 'react';
import { useNewsFeed } from '../../../hooks/useNewsFeed';
import { api } from '../../../state/backendApi';

export const ResourcesAndUpdates: React.FC = () => {
  const platform = api.isRedpanda ? 'redpanda' : 'kafka';
  const { data: news, isLoading, error } = useNewsFeed(platform);

  return (
    <Box>
      {isLoading ? (
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
      ) : error ? (
        <Text>Failed to load news</Text>
      ) : (
        <Flex direction="column" gap={4}>
          {news?.length === 0 && <Text>No updates available</Text>}
          {news?.map((item) => (
            <Box
              key={item.id}
              _hover={{ bg: 'gray.50', cursor: 'pointer' }}
              p={2}
              display="flex"
              justifyContent="space-between"
              gap={10}
            >
              <Link
                key={item.id}
                href={item.fieldData['link-url']}
                target="_blank"
                rel="noopener noreferrer"
                className="!no-underline"
              >
                <Text fontWeight="medium">{item.fieldData.message}</Text>
                <Text mt={1} display="inline-block" fontWeight="normal" className="text-gray-700">
                  {item.fieldData['link-text']}
                </Text>
              </Link>
              {item.fieldData['cta-button-text'] ? (
                <Button
                  alignSelf="center"
                  variant={item.fieldData['cta-button-variant']}
                  size="sm"
                  as="a"
                  href={item.fieldData['link-url']}
                  style={{
                    textDecoration: 'none',
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="mx-2">{item.fieldData['cta-button-text']}</span>
                </Button>
              ) : null}
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default ResourcesAndUpdates;
