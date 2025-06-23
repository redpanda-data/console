import { Box, Flex, Link, Skeleton, Text } from '@redpanda-data/ui';
import React from 'react';
import { useNewsFeed } from '../../../hooks/useNewsFeed';
import { api } from '../../../state/backendApi';

export const ResourcesAndUpdates: React.FC = () => {
  const platform = api.isRedpanda ? 'redpanda' : 'kafka';
  const { news, loading, error } = useNewsFeed(platform);

  return (
    <Box>
      {loading ? (
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
        <Text>Failed to load news: {error}</Text>
      ) : (
        <Flex direction="column" gap={4}>
          {news.map((item) => (
            <Link
              key={item.id}
              href={item.fieldData['link-url']}
              target="_blank"
              rel="noopener noreferrer"
              className="!no-underline"
              style={{ textDecoration: 'none' }}
            >
              <Box _hover={{ bg: 'gray.50', cursor: 'pointer' }} py={2}>
                <Text fontWeight="medium">{item.fieldData.message}</Text>
                <Text mt={1} display="inline-block" fontWeight="normal" className="text-gray-700">
                  {item.fieldData['link-text']}
                </Text>
              </Box>
            </Link>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default ResourcesAndUpdates;
