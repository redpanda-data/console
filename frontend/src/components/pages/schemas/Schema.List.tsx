import React from "react";
import { observer } from "mobx-react";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { Table } from "antd";

@observer
class SchemaList extends PageComponent<{}> {
    initPage(p: PageInitHelper): void {
        p.title = 'Scheme Registry';
        p.addBreadcrumb('Schema Registry', '/schemas');
        api.refreshSchemaOverview(false);
    }
    render() {
        console.dir({overview: api.SchemaOverview})
        return (<Table
        /*  TODO: requestError */
            columns={[
                { title: 'Name', dataIndex: 'name' },
                { title: 'Compatibility Level', dataIndex: 'compatibilityLevel' },
                { title: 'Versions', dataIndex: 'versionsCount' },
                { title: 'Latest Version', dataIndex: 'latestVersion' },
            ]}
            dataSource={api.SchemaOverview?.subjects}
        ></Table>)
    }
}

export default SchemaList;