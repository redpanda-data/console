import { observer, useLocalObservable } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { Box, Button, Dropzone, Flex, FormField, Link, Textarea } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { FC } from 'react';
import { api } from '../../../state/backendApi';
import { SetLicenseRequest } from '../../../protogen/redpanda/api/console/v1alpha1/license_pb';

const UploadLicenseForm: FC<{
    onUploadLicense: (license: string) => Promise<void>,
}> = observer(({ onUploadLicense }) => {
    const state = useLocalObservable(() => ({
        licenseFile: undefined as string | undefined,
        license: '',
        setLicenseFile(value: string | undefined) {
            this.licenseFile = value;
        },
        setLicense(value: string) {
            this.license = value;
        },
    }));

    return (
        <form onSubmit={async (e) => {
            e.preventDefault();
            await onUploadLicense(state.licenseFile || state.license);
        }}>
            <Flex flexDirection="column" gap={2} my={4} width={{sm: '100%', md: '600px'}}>
                <Box
                    border="1px solid"
                    borderColor="gray.200"
                    padding="4"
                    borderRadius="md"
                >
                    <Dropzone setRawString={(value) => {
                        state.setLicenseFile(value);
                    }}/>
                </Box>
                or import text directly

                <FormField label="License content">
                    <Textarea
                        isDisabled={state.licenseFile!==undefined}
                        data-testid="license"
                        onChange={(e) => state.setLicense(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                    >
                        {state.license}
                    </Textarea>
                </FormField>
                <Box>
                    {/*{JSON.stringify({*/}
                    {/*    licenseFile: state.licenseFile,*/}
                    {/*    license: state.license*/}
                    {/*})}*/}
                    <Button type="submit">Upload</Button>
                </Box>
            </Flex>
        </form>
    );
});

@observer
export default class UploadLicensePage extends PageComponent<{}> {

    @observable x: string = '';

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Upload Enterprise License';
        p.addBreadcrumb('Admin', '/admin');
        p.addBreadcrumb('Upload License', '/admin/upload-license');
    }

    render() {
        return (
            <PageContent>
                <Box>
                    To get an enterprise license <Link href="https://www.redpanda.com/try-redpanda" target="_blank">contact our support team</Link>
                    <UploadLicenseForm onUploadLicense={async (license) => {
                        await api.uploadLicense({
                            license,
                        } as SetLicenseRequest)
                    }}/>
                </Box>
            </PageContent>
        );
    }
}
