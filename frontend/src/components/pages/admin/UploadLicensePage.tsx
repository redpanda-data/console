import { observer, useLocalObservable } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { Alert, AlertDescription, AlertIcon, Box, Button, Dropzone, Flex, FormField, Link, Result, Text, Textarea } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { FC } from 'react';
import { api } from '../../../state/backendApi';
import { SetLicenseRequest, SetLicenseResponse } from '../../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { appGlobal } from '../../../state/appGlobal';

const UploadLicenseForm: FC<{
    onUploadLicense: (license: string) => Promise<SetLicenseResponse>,
    onSuccess: () => void,
}> = observer(({onUploadLicense, onSuccess}) => {
    const state = useLocalObservable(() => ({
        licenseFile: undefined as string | undefined,
        license: '',
        errorMessage: '',
        success: true,
        setLicenseFile(value: string | undefined) {
            this.licenseFile = value;
        },
        setLicense(value: string) {
            this.license = value;
        },
        setErrorMessage(value: string) {
            this.errorMessage = value;
        }
    }));

    return (
        <form onSubmit={async (e) => {
            e.preventDefault();
            await onUploadLicense(state.licenseFile || state.license).then(() => {
                onSuccess();
            }).catch(err => {
                state.errorMessage = err.message;
            });
        }}>
            <Flex flexDirection="column" gap={2} my={4}>
                <Box
                    border="1px dashed"
                    borderColor="gray.200"
                    padding="4"
                    borderRadius="md"
                >
                    <Dropzone setRawString={(value) => {
                        state.setLicenseFile(value);
                    }}/>
                </Box>
                or import text directly:

                <FormField label="License content">
                    <Textarea
                        rows={10}
                        isDisabled={state.licenseFile!==undefined}
                        data-testid="license"
                        onChange={(e) => state.setLicense(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                    >
                        {state.license}
                    </Textarea>
                </FormField>
                {state.errorMessage && <Alert
                    status="error"
                    variant="left-accent"
                >
                    <AlertIcon/>
                    <AlertDescription>
                        {state.errorMessage}
                    </AlertDescription>
                </Alert>}
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

    @observable success: boolean = false;

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
                {this.success ? <Box mb={20}><Result
                        status="success"
                        title="License uploaded successfully"
                        subTitle={<Flex flexDirection="column" gap={4}>
                            <Box>
                                <Text fontWeight="normal">A restart will be needed to use Redpanda Console's enterprise features.</Text>
                                <Text fontWeight="normal">Enterprise features in your Redpanda cluster will be available right away.</Text>
                            </Box>
                            <Box><Button onClick={() => {
                                // TODO fix after https://github.com/redpanda-data/ui/issues/569 is resolved
                                appGlobal.history.push('/overview');
                            }} variant="solid"><Text>Back to overview</Text></Button></Box>
                        </Flex>}
                    /></Box>:
                    <>
                        <Box>
                            To get an enterprise license, <Link href="https://www.redpanda.com/try-redpanda" target="_blank">contact our support team</Link>.
                            To see a list of what is available with Redpanda Enterprise, check <Link href="https://docs.redpanda.com/current/get-started/licenses/#redpanda-enterprise-edition" target="_blank">our documentation</Link>.
                        </Box>
                        <Box width={{sm: '100%', md: '600px'}}>
                            <UploadLicenseForm
                                onUploadLicense={async (license) => {
                                    return await api.uploadLicense({
                                        license,
                                    } as SetLicenseRequest);
                                }}
                                onSuccess={() => {
                                    this.success = true;
                                }}
                            />
                        </Box>
                    </>}
            </PageContent>
        );
    }
}
