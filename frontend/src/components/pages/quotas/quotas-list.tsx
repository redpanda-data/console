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

import { SkipIcon } from '@primer/octicons-react';
import { Alert, AlertIcon, Button, DataTable, Result } from '@redpanda-data/ui';
import { computed, makeObservable } from 'mobx';
import { observer } from 'mobx-react';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { type QuotaResponseSetting, QuotaType } from '../../../state/rest-interfaces';
import { toJson } from '../../../utils/json-utils';
import { DefaultSkeleton, InfoText } from '../../../utils/tsx-utils';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper } from '../page';

@observer
class QuotasList extends PageComponent {
  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Quotas';
    p.addBreadcrumb('Quotas', '/quotas');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    if (api.userData != null && !api.userData.canListQuotas) {
      return;
    }
    api.refreshQuotas(force);
  }

  render() {
    if (api.userData != null && !api.userData.canListQuotas) {
      return PermissionDenied;
    }
    if (api.Quotas === undefined) {
      return DefaultSkeleton;
    }

    const warning =
      api.Quotas === null ? (
        <Alert status="warning" style={{ marginBottom: '1em' }} variant="solid">
          <AlertIcon />
          You do not have the necessary permissions to view Quotas
        </Alert>
      ) : null;

    const resources = this.quotasList;
    const formatBytes = (x: undefined | number) =>
      x ? (
        prettyBytes(x)
      ) : (
        <span style={{ opacity: 0.3 }}>
          <SkipIcon />
        </span>
      );
    const formatRate = (x: undefined | number) =>
      x ? (
        prettyNumber(x)
      ) : (
        <span style={{ opacity: 0.3 }}>
          <SkipIcon />
        </span>
      );

    return (
      <PageContent>
        <Section>
          {warning}

          <DataTable<{
            eqKey: string;
            entityType: 'client-id' | 'user' | 'ip';
            entityName?: string | undefined;
            settings: QuotaResponseSetting[];
          }>
            columns={[
              {
                size: 100, // Assuming '100px' translates to '100'
                header: 'Type',
                accessorKey: 'entityType',
              },
              {
                size: 100, // 'auto' width replaced with an example number
                header: 'Name',
                accessorKey: 'entityName',
              },
              {
                size: 100,
                header: () => <InfoText tooltip="Limit throughput of produce requests">Producer Rate</InfoText>,
                accessorKey: 'producerRate',
                cell: ({ row: { original } }) =>
                  formatBytes(original.settings.first((k) => k.key === QuotaType.PRODUCER_BYTE_RATE)?.value),
              },
              {
                size: 100,
                header: () => <InfoText tooltip="Limit throughput of fetch requests">Consumer Rate</InfoText>,
                accessorKey: 'consumerRate',
                cell: ({ row: { original } }) =>
                  formatBytes(original.settings.first((k) => k.key === QuotaType.CONSUMER_BYTE_RATE)?.value),
              },
              {
                size: 100,
                header: () => (
                  <InfoText tooltip="Limit rate of topic mutation requests, including create, add, and delete partition, in number of partitions per second">
                    Controller Mutation Rate
                  </InfoText>
                ),
                accessorKey: 'controllerMutationRate',
                cell: ({ row: { original } }) =>
                  formatRate(original.settings.first((k) => k.key === QuotaType.CONTROLLER_MUTATION_RATE)?.value),
              },
            ]}
            data={resources}
          />
        </Section>
      </PageContent>
    );
  }

  @computed get quotasList() {
    const quotaResponse = api.Quotas;
    if (!quotaResponse || quotaResponse.error) {
      return [];
    }

    return quotaResponse.items.map((x) => ({ ...x, eqKey: toJson(x) }));
  }
}

const PermissionDenied = (
  <>
    <PageContent key="quotasNoPerms">
      <Section>
        <Result
          extra={
            <a href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
              <Button variant="solid">Redpanda Console documentation for roles and permissions</Button>
            </a>
          }
          status={403}
          title="Forbidden"
          userMessage={
            <p>
              You are not allowed to view this page.
              <br />
              Contact the administrator if you think this is an error.
            </p>
          }
        />
      </Section>
    </PageContent>
  </>
);

export default QuotasList;
