/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription, AlertIcon, AlertTitle, Box, Grid, GridItem, Heading, Link } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useState } from 'react';

import type { Payload } from '../../../../../state/rest-interfaces';

export const TroubleshootReportViewer = observer((props: { payload: Payload }) => {
  const report = props.payload.troubleshootReport;
  const [show, setShow] = useState(true);

  if (!report) {
    return null;
  }
  if (report.length === 0) {
    return null;
  }

  return (
    <Box mb="4" mt="4">
      <Heading as="h4">Deserialization Troubleshoot Report</Heading>
      <Alert background="red.50" flexDirection="column" my={4} status="error" variant="subtle">
        <AlertTitle
          alignItems="center"
          alignSelf="flex-start"
          display="flex"
          flexDirection="row"
          fontWeight="normal"
          pb="4"
        >
          <AlertIcon /> Errors were encountered when deserializing this message
          <Link onClick={() => setShow(!show)} pl="2">
            {show ? 'Hide' : 'Show'}
          </Link>
        </AlertTitle>
        <AlertDescription display={show ? undefined : 'none'} whiteSpace="pre-wrap">
          <Grid columnGap="4" rowGap="1" templateColumns="auto 1fr">
            {report.map((e) => (
              <>
                <GridItem
                  fontWeight="bold"
                  key={`${e.serdeName}-name`}
                  pl="8"
                  px="5"
                  py="2"
                  textTransform="capitalize"
                  w="100%"
                >
                  {e.serdeName}
                </GridItem>
                <GridItem
                  background="red.100"
                  fontFamily="monospace"
                  key={`${e.serdeName}-message`}
                  px="5"
                  py="2"
                  w="100%"
                >
                  {e.message}
                </GridItem>
              </>
            ))}
          </Grid>
        </AlertDescription>
      </Alert>
    </Box>
  );
});
