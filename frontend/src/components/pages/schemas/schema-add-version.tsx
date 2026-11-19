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

import { SchemaAddVersionPageContent } from './schema-create';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { PageComponent, type PageInitHelper } from '../page';

export class SchemaAddVersionPage extends PageComponent<{ subjectName: string }> {
  initPage(p: PageInitHelper): void {
    const subjectName = decodeURIComponent(this.props.subjectName);
    const encodedSubjectName = encodeURIComponent(subjectName);
    p.title = 'Add schema version';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    p.addBreadcrumb(subjectName, `/schema-registry/subjects/${encodedSubjectName}`, undefined, {
      canBeTruncated: true,
    });
    p.addBreadcrumb('Create schema', `/schema-registry/subjects/${encodedSubjectName}/add-version`);
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig();
    api.refreshSchemaMode();
    api.refreshSchemaSubjects(force);
    api.refreshSchemaTypes(force);

    const subjectName = decodeURIComponent(this.props.subjectName);
    api.refreshSchemaDetails(subjectName, force);
  }

  render() {
    return <SchemaAddVersionPageContent subjectName={decodeURIComponent(this.props.subjectName)} />;
  }
}
