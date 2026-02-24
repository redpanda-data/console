import { Avatars, Box, Flex, Image, Text, VStack } from '@redpanda-data/ui';
import { Link } from 'components/redpanda-ui/components/typography';
import { observer } from 'mobx-react';

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

@observer
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
      <Flex align="center" justify="center" p={4}>
        <Box bg="white" height="100vh" left={0} opacity={0.5} position="fixed" top={0} width="100vw" zIndex={1000} />
        <Box maxW="600px" mx="auto" p={8} textAlign="center" zIndex={1001}>
          <VStack spacing={6}>
            <Image alt="Dev Redpanda" src={Avatars.devPandaFrontViewSvg} w={300} />

            {/* Main Heading */}
            <Text fontSize="2xl" fontWeight="bold">
              Your Redpanda Enterprise license has expired.
            </Text>

            {/* Subtext */}
            <Text fontSize="lg">
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
            </Text>
          </VStack>
        </Box>
      </Flex>
    );
  }
}
