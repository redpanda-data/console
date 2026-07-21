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

import { AlertTriangle } from 'lucide-react';
import { Fragment, useState } from 'react';

import type { Payload } from '../../../../../state/rest-interfaces';
import { Alert, AlertDescription, AlertTitle } from '../../../../redpanda-ui/components/alert';

export const TroubleshootReportViewer = (props: { payload: Payload }) => {
  const report = props.payload.troubleshootReport;
  const [show, setShow] = useState(true);

  if (!report) {
    return null;
  }
  if (report.length === 0) {
    return null;
  }

  return (
    <div className="my-4">
      <h4 className="text-heading-xl">Deserialization Troubleshoot Report</h4>
      <Alert className="mt-4" icon={<AlertTriangle />} variant="destructive">
        <AlertTitle className="flex items-center font-normal [&]:line-clamp-none">
          Errors were encountered when deserializing this message
          <button
            className="cursor-pointer border-none bg-transparent pl-2 font-medium text-primary underline underline-offset-4"
            onClick={() => setShow(!show)}
            type="button"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </AlertTitle>
        {show ? (
          <AlertDescription className="whitespace-pre-wrap">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {report.map((e) => (
                <Fragment key={e.serdeName}>
                  <div className="w-full px-5 py-2 pl-8 font-bold capitalize">{e.serdeName}</div>
                  <div className="w-full bg-background-error-subtle px-5 py-2 font-mono">{e.message}</div>
                </Fragment>
              ))}
            </div>
          </AlertDescription>
        ) : null}
      </Alert>
    </div>
  );
};
