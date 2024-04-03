/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { Box, Button, createStandaloneToast, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';

const { ToastContainer, toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: {
        ...redpandaToastOptions.defaultOptions,
        isClosable: false,
        duration: 2000,
    },
});

@observer
class UserEditPage extends PageComponent<{ userName: string; }> {

    @observable username: string = '';
    @observable mechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512' = 'SCRAM-SHA-256';

    @observable isValidUsername: boolean = false;
    @observable isValidPassword: boolean = false;

    @observable generateWithSpecialChars: boolean = false;
    @observable step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION' = 'CREATE_USER';
    @observable isCreating: boolean = false;

    @observable selectedRoles: string[] = [];

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Create user';
        p.addBreadcrumb('Access control', '/security');
        p.addBreadcrumb('Users', '/security/users');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;

        await Promise.allSettled([
            api.refreshAcls(AclRequestDefault, force),
            api.refreshServiceAccounts(true)
        ]);
    }

    render() {
        if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

        return <>
            <ToastContainer />

            <PageContent>
                <Box>
                    <Button onClick={() => {
                        toast({
                            description: 'todo'
                        })
                    }}>Save</Button>
                </Box>
            </PageContent>
        </>
    }


}

export default UserEditPage;


