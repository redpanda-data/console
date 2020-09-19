import React from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';

export interface SchemaDetailsProps {
    subjectName: string;
    query: {
        version: number
    }
}

class SchemaDetails extends PageComponent<SchemaDetailsProps> {
    initPage(p: PageInitHelper): void {
        const { subjectName, query: { version } } = this.props;
        p.title = subjectName;
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb(subjectName, `/schema-registry/${subjectName}?version=${version}`);
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaDetails(this.props.subjectName, this.props.query.version, force);
    }

    render() {
        return <h1>Schema Details: {this.props.subjectName}</h1>;
    }
}

export default SchemaDetails;
