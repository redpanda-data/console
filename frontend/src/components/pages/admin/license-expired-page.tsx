import { Avatars, Box, Flex, Image, Link, Text, VStack } from '@redpanda-data/ui';
import { observer } from 'mobx-react';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { DISABLE_SSO_DOCS_LINK } from '../../license/license-utils';
import { PageComponent } from '../page';

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
              You were using Console RBAC/SSO and your trial license has expired. To continue using them, you will need
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
