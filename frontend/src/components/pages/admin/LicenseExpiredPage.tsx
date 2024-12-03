import { Avatars, Box, Flex, Image, Link, Text, VStack } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { DISABLE_SSO_DOCS_LINK } from '../../license/licenseUtils';
import { PageComponent } from '../Page';

@observer
export default class LicenseExpiredPage extends PageComponent {
  initPage(): void {
    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  refreshData() {
    void api.listLicenses();
  }

  render() {
    return (
      <Flex align="center" justify="center" p={4}>
        <Box position="fixed" top={0} left={0} width="100vw" height="100vh" bg="white" opacity={0.5} zIndex={1000} />
        <Box textAlign="center" p={8} maxW="600px" mx="auto" zIndex={1001}>
          <VStack spacing={6}>
            <Image w={300} src={Avatars.devPandaFrontViewSvg} alt="Dev Redpanda" />

            {/* Main Heading */}
            <Text fontSize="2xl" fontWeight="bold">
              Your Redpanda Enterprise license has expired.
            </Text>

            {/* Subtext */}
            <Text fontSize="lg">
              You were using Console RBAC/SSO and your trial license has expired. To continue using them, you will need
              an{' '}
              <Link href="https://redpanda.com/upgrade" target="_blank">
                Enterprise license
              </Link>
              . Alternatively, you can{' '}
              <Link href={DISABLE_SSO_DOCS_LINK} target="_blank">
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
