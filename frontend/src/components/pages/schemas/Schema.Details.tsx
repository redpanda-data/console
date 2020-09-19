import React from 'react';
import { PageComponent, PageInitHelper } from '../Page';

class SchemaDetails extends PageComponent<{ schemaName: string }> {
    initPage(p: PageInitHelper): void {
        const { schemaName } = this.props
        p.title = schemaName
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb(schemaName, `/schema-registry/${schemaName}`);
    }

    render() {
        return <h1>Schema Details: {this.props.schemaName}</h1>
    }
}

export default SchemaDetails;
