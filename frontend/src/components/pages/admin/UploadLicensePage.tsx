import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { Box, Flex, Link, Textarea } from '@redpanda-data/ui';
import { Button } from '@redpanda-data/ui';

@observer
export default class UploadLicensePage extends PageComponent {
    initPage(p: PageInitHelper): void {
        p.title = 'Upload Enterprise License';
        p.addBreadcrumb('Admin', '/admin');
        p.addBreadcrumb('Upload License', '/admin/upload-license');
    }

    render() {
        return (
            <PageContent>
                <Box>
                    To get an enterprise license <Link>contact our support team</Link>
                    <Flex flexDirection="column" gap={2} my={4}>
                        License content
                        <Textarea></Textarea>
                        <Box>
                            <Button>Upload</Button>
                        </Box>
                    </Flex>
                </Box>
            </PageContent>
        );
    }
}
