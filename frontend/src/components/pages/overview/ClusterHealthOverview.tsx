import { Box, Button, Flex, Grid, Link, List, ListItem, Text } from '@redpanda-data/ui';
import { MdError, MdOutlineWarning } from 'react-icons/md';
import { Link as ReactRouterLink } from 'react-router-dom';
import colors from '../../../colors';
import { UnhealthyReason } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { api } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';
import { titleCase } from '../../../utils/utils';
import DebugBundleLink from '../../debugBundle/DebugBundleLink';

const HUMAN_READABLE_UNHEALTHY_REASONS: Record<UnhealthyReason, string> = {
  [UnhealthyReason.UNSPECIFIED]: 'Unknown reason',
  [UnhealthyReason.NODES_DOWN]: 'Unreachable brokers',
  [UnhealthyReason.LEADERLESS_PARTITIONS]: 'Leaderless partitions',
  [UnhealthyReason.UNDER_REPLICATED_PARTITIONS]: 'Under-replicated partitions',
  [UnhealthyReason.NO_ELECTED_CONTROLLER]: 'No elected controller',
  [UnhealthyReason.NO_HEALTH_REPORT]: 'No health report',
};

const ClusterHealthOverview = () => {
  return (
    <Box>
      <List spacing={3}>
        <ListItem>
          <Grid
            templateColumns={{ sm: '1fr', md: '1fr 1fr' }} // Single column on mobile, two columns on larger screens
            gap={4}
          >
            <Box fontWeight="bold">Reason</Box>
            <Box>
              {titleCase(
                api.clusterHealth?.unhealthyReasons
                  ?.map((x) => HUMAN_READABLE_UNHEALTHY_REASONS[x].toLowerCase() ?? x)
                  .join(', ') ?? '',
              )}
            </Box>
          </Grid>
        </ListItem>
        <ListItem>
          <Grid templateColumns={{ sm: '1fr', md: '1fr 1fr' }} gap={4}>
            <Box fontWeight="bold">Unreachable brokers</Box>
            <Flex gap={1}>
              {api.clusterHealth?.offlineBrokerIds && api.clusterHealth?.offlineBrokerIds.length > 0 && (
                <MdError color={colors.brandError} size={18} />
              )}
              <Text>{api.clusterHealth?.offlineBrokerIds.length}</Text>
            </Flex>
          </Grid>
        </ListItem>
        {api.clusterHealth?.unhealthyReasons.includes(UnhealthyReason.LEADERLESS_PARTITIONS) && (
          <ListItem>
            <Grid templateColumns={{ sm: '1fr', md: '1fr 1fr' }} gap={4}>
              <Box fontWeight="bold">{HUMAN_READABLE_UNHEALTHY_REASONS[UnhealthyReason.LEADERLESS_PARTITIONS]}</Box>
              <Flex gap={2}>
                <Flex gap={1}>
                  <MdError color={colors.brandError} size={18} />{' '}
                  <Text>{api.clusterHealth?.leaderlessPartitionsCount}</Text>
                </Flex>{' '}
                <Link as={ReactRouterLink} to="/topics">
                  View topics
                </Link>
              </Flex>
            </Grid>
          </ListItem>
        )}
        {api.clusterHealth?.unhealthyReasons.includes(UnhealthyReason.UNDER_REPLICATED_PARTITIONS) && (
          <ListItem>
            <Grid templateColumns={{ sm: '1fr', md: '1fr 1fr' }} gap={4}>
              <Box fontWeight="bold">
                {HUMAN_READABLE_UNHEALTHY_REASONS[UnhealthyReason.UNDER_REPLICATED_PARTITIONS]}
              </Box>
              <Flex gap={2}>
                <Flex gap={1}>
                  <MdOutlineWarning color={colors.brandWarning} size={18} />{' '}
                  <Text>{api.clusterHealth?.underReplicatedPartitionsCount}</Text>
                </Flex>{' '}
                <Link as={ReactRouterLink} to="/topics">
                  View topics
                </Link>
              </Flex>
            </Grid>
          </ListItem>
        )}
        {api.userData?.canViewDebugBundle && Features.debugBundle && (
          <ListItem>
            <Grid templateColumns={{ sm: '1fr', md: '1fr 1fr' }} gap={4}>
              <Box fontWeight="bold">Debug bundle</Box>
              <Flex gap={2}>
                {api.isDebugBundleInProgress && (
                  <Button
                    px={0}
                    as={ReactRouterLink}
                    variant="link"
                    to={`/admin/debug-bundle/progress/${api.debugBundleStatus?.jobId}`}
                  >
                    Bundle generation in progress...
                  </Button>
                )}
                {api.canDownloadDebugBundle && (
                  <DebugBundleLink statuses={api.debugBundleStatuses} showDatetime={false} />
                )}
                {!api.isDebugBundleInProgress && (
                  <Button px={0} as={ReactRouterLink} variant="link" to="/admin/debug-bundle/">
                    Generate new
                  </Button>
                )}
              </Flex>
            </Grid>
          </ListItem>
        )}
      </List>
    </Box>
  );
};

export default ClusterHealthOverview;
