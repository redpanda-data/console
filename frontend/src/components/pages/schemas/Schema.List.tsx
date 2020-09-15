import { appGlobal } from '../../../state/appGlobal';

@observer
class SchemaList extends PageComponent<{}> {
    initPage(p: PageInitHelper): void {
        p.title = 'Scheme Registry';
        p.addBreadcrumb('Schema Registry', '/schemas');
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true)
    }
    refreshData(force?: boolean) {
        api.refreshSchemaOverview(force);
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