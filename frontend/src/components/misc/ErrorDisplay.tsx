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

import React, { FC, ReactElement } from 'react';
import { observer } from 'mobx-react';
import { Button, List, ListIcon, ListItem, Result, Section } from '@redpanda-data/ui';
import { api } from '../../state/backendApi';
import { WarningIcon } from '@chakra-ui/icons';


export const ErrorDisplay: FC<{children: ReactElement}> = observer(({ children }) => {
    if (api.errors.length === 0) {
        return children;
    }

    return (
        <>
            <Result
                status={500}
                title="Backend API Error"
                userMessage="Something went wrong while pulling data from the backend server"
                extra={<Button alignSelf="center" onClick={clearErrors}>Retry</Button>}
            />

            <Section>
                <List spacing={3}>
                    {api.errors.map((e, i) => (
                        <ListItem key={i} display="flex">
                            <ListIcon as={WarningIcon} color="red.500" alignSelf="center" />
                            {formatError(e)}
                        </ListItem>
                    ))}
                </List>
            </Section>
        </>
    );
});

function formatError(err: any): string {
    if (err instanceof Error && err.message) {
        return err.message;
    }
    return String(err);
}

function clearErrors() {
    api.errors = [];
}
