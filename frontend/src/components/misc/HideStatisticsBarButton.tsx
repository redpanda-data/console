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

import React, { FC } from 'react';
import { EyeClosedIcon } from '@primer/octicons-react';
import { Flex, Text, Tooltip, useToast } from '@redpanda-data/ui';

export const HideStatisticsBarButton: FC<{ onClick: () => void }> = ({onClick}) => {
    const toast = useToast()
    return (
        <Tooltip label={<Text whiteSpace="nowrap">Hide statistics bar</Text>} placement="right" hasArrow>
            <div className="hideStatsBarButton" onClick={() => {
                onClick()
                toast({
                    status: 'info',
                    description: 'Statistics bar hidden! You can enable it again in the preferences.'
                });
            }}>
                <Flex width="100%">
                    <EyeClosedIcon size="medium"/>
                </Flex>
            </div>
        </Tooltip>
    );
}
