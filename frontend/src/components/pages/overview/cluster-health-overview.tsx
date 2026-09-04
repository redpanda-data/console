import { Link } from '@tanstack/react-router';
import { ErrorIcon, WarningIcon } from 'components/icons';
import { buttonVariants } from 'components/redpanda-ui/components/button';
import { cn } from 'components/redpanda-ui/lib/utils';

import { UnhealthyReason } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { api } from '../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { titleCase } from '../../../utils/utils';
import DebugBundleLink from '../../debugBundle/debug-bundle-link';

const HUMAN_READABLE_UNHEALTHY_REASONS: Record<UnhealthyReason, string> = {
  [UnhealthyReason.UNSPECIFIED]: 'Unknown reason',
  [UnhealthyReason.NODES_DOWN]: 'Unreachable brokers',
  [UnhealthyReason.LEADERLESS_PARTITIONS]: 'Leaderless partitions',
  [UnhealthyReason.UNDER_REPLICATED_PARTITIONS]: 'Under-replicated partitions',
  [UnhealthyReason.NO_ELECTED_CONTROLLER]: 'No elected controller',
  [UnhealthyReason.NO_HEALTH_REPORT]: 'No health report',
};

const ROW_GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2';

const ClusterHealthOverview = () => {
  const featureDebugBundle = useSupportedFeaturesStore((s) => s.debugBundle);
  return (
    <div>
      <ul className="flex flex-col gap-3">
        <li>
          {/* Single column on mobile, two columns on larger screens */}
          <div className={ROW_GRID}>
            <div className="font-bold">Reason</div>
            <div>
              {titleCase(
                api.clusterHealth?.unhealthyReasons
                  ?.map((x) => HUMAN_READABLE_UNHEALTHY_REASONS[x].toLowerCase() ?? x)
                  .join(', ') ?? ''
              )}
            </div>
          </div>
        </li>
        <li>
          <div className={ROW_GRID}>
            <div className="font-bold">Unreachable brokers</div>
            <div className="flex gap-1">
              {api.clusterHealth?.offlineBrokerIds && api.clusterHealth?.offlineBrokerIds.length > 0 && (
                <ErrorIcon className="text-destructive" size={18} />
              )}
              <div>{api.clusterHealth?.offlineBrokerIds.length}</div>
            </div>
          </div>
        </li>
        {api.clusterHealth?.unhealthyReasons.includes(UnhealthyReason.LEADERLESS_PARTITIONS) && (
          <li>
            <div className={ROW_GRID}>
              <div className="font-bold">{HUMAN_READABLE_UNHEALTHY_REASONS[UnhealthyReason.LEADERLESS_PARTITIONS]}</div>
              <div className="flex gap-2">
                <div className="flex gap-1">
                  <ErrorIcon className="text-destructive" size={18} />{' '}
                  <div>{api.clusterHealth?.leaderlessPartitionsCount}</div>
                </div>{' '}
                <Link search={{} as never} to="/topics">
                  View topics
                </Link>
              </div>
            </div>
          </li>
        )}
        {api.clusterHealth?.unhealthyReasons.includes(UnhealthyReason.UNDER_REPLICATED_PARTITIONS) && (
          <li>
            <div className={ROW_GRID}>
              <div className="font-bold">
                {HUMAN_READABLE_UNHEALTHY_REASONS[UnhealthyReason.UNDER_REPLICATED_PARTITIONS]}
              </div>
              <div className="flex gap-2">
                <div className="flex gap-1">
                  <WarningIcon className="text-warning" size={18} />{' '}
                  <div>{api.clusterHealth?.underReplicatedPartitionsCount}</div>
                </div>{' '}
                <Link search={{} as never} to="/topics">
                  View topics
                </Link>
              </div>
            </div>
          </li>
        )}
        {Boolean(api.userData?.canViewDebugBundle && featureDebugBundle) && (
          <li>
            <div className={ROW_GRID}>
              <div className="font-bold">Debug bundle</div>
              <div className="flex gap-2">
                {Boolean(api.isDebugBundleInProgress) && (
                  // debug-bundle-page.ts looks this up with getByRole('link'), so it stays an anchor.
                  <Link
                    className={cn(buttonVariants({ variant: 'link' }), 'px-0')}
                    params={{ jobId: api.debugBundleStatus?.jobId ?? '' }}
                    to="/debug-bundle/progress/$jobId"
                  >
                    Bundle generation in progress...
                  </Link>
                )}
                {Boolean(api.canDownloadDebugBundle) && (
                  <DebugBundleLink showDatetime={false} statuses={api.debugBundleStatuses} />
                )}
                {!api.isDebugBundleInProgress && (
                  <Link className={cn(buttonVariants({ variant: 'link' }), 'px-0')} to="/debug-bundle">
                    Generate new
                  </Link>
                )}
              </div>
            </div>
          </li>
        )}
      </ul>
    </div>
  );
};

export default ClusterHealthOverview;
