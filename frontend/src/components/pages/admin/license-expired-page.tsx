import { Link } from 'components/redpanda-ui/components/typography';

import devPandaFrontView from '../../../assets/redpanda/DevPandaFrontView.svg';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { DISABLE_SSO_DOCS_LINK } from '../../license/license-utils';
import { PageComponent } from '../page';

/**
 * Formats a list of enabled enterprise feature names into a human-readable string.
 * Returns undefined if no features are enabled.
 */
function formatEnabledFeatures(features: { name: string; enabled: boolean }[]): string | undefined {
  const enabledFeatures = features.filter((f) => f.enabled).map((f) => f.name);

  if (enabledFeatures.length === 0) {
    return;
  }

  if (enabledFeatures.length === 1) {
    return enabledFeatures[0];
  }

  if (enabledFeatures.length === 2) {
    return `${enabledFeatures[0]} and ${enabledFeatures[1]}`;
  }

  return `${enabledFeatures.slice(0, -1).join(', ')}, and ${enabledFeatures.at(-1)}`;
}

export default class LicenseExpiredPage extends PageComponent {
  initPage(): void {
    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  refreshData() {
    api.listLicenses().catch(() => {
      // Error handling managed by API layer
    });
  }

  render() {
    const enabledFeaturesText = formatEnabledFeatures(api.enterpriseFeaturesUsed);

    return (
      <div className="flex items-center justify-center p-4">
        {/* Scrim over the page underneath; the panel sits one layer above it. */}
        <div className="fixed top-0 left-0 z-[1000] h-screen w-screen bg-background opacity-50" />
        <div className="z-[1001] mx-auto max-w-[600px] p-8 text-center">
          <div className="flex flex-col items-center gap-6">
            <img alt="Dev Redpanda" className="w-[300px]" src={devPandaFrontView} />

            {/* Main Heading */}
            <p className="text-heading-lg">Your Redpanda Enterprise license has expired.</p>

            {/* Subtext */}
            <p className="text-body-lg">
              {enabledFeaturesText
                ? `You were using ${enabledFeaturesText} and your license has expired. To continue using these features, you will need`
                : 'Your license has expired. To continue using enterprise features, you will need'}{' '}
              an{' '}
              <Link href="https://redpanda.com/upgrade" rel="noopener noreferrer" target="_blank">
                Enterprise license
              </Link>
              . Alternatively, you can{' '}
              <Link href={DISABLE_SSO_DOCS_LINK} rel="noopener noreferrer" target="_blank">
                disable
              </Link>{' '}
              the paid features in your configuration file.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
