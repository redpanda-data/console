import { Avatars, Box, Flex, Image, Text, VStack } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { PageComponent } from '../Page';
import { api } from '../../../state/backendApi';
import { appGlobal } from '../../../state/appGlobal';

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
        const activeEnterpriseFeatures = api.enterpriseFeaturesUsed.filter(x => x.enabled)

        return (
            <Flex
                align="center"
                justify="center"
                p={4}
            >
                <Box
                    position="fixed"
                    top={0}
                    left={0}
                    width="100vw"
                    height="100vh"
                    bg="white"
                    opacity={0.5}
                    zIndex={1000}
                />
                <Box textAlign="center" p={8} maxW="600px" mx="auto" zIndex={1001}>
                    <VStack spacing={6}>
                        <Image
                            w={300}
                            src={Avatars.devPandaFrontViewSvg}
                            alt="Dev Redpanda"
                        />

                        {/* Main Heading */}
                        <Text fontSize="2xl" fontWeight="bold">
                            Your Enterprise trial has expired.
                        </Text>

                        {/* Subtext */}
                        <Text fontSize="lg">
                            You are using the below Enterprise {activeEnterpriseFeatures.length === 1 ? 'feature' : 'features'} and your trial license has
                            expired:
                        </Text>

                        {/* Features */}
                        <Text fontSize="lg" fontWeight="bold" color="gray.600">
                            {activeEnterpriseFeatures.map(x => x.name).join(', ')}
                        </Text>

                        {/* Additional Information */}
                        <Text fontSize="md" color="gray.500">
                            To continue using them, you will need an Enterprise license.
                            Alternatively, you can{' '}
                            {/*<Link href="/configuration" color="blue.500" textDecoration="underline">*/}
                            {/*    disable the paid features in your configuration file.*/}
                            {/*</Link>*/}
                        </Text>
                    </VStack>
                </Box>
            </Flex>
        );
    }
}
