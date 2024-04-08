import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import PageContent from '../../misc/PageContent';
import { SmallStat } from '../../misc/SmallStat';
import { computed } from 'mobx';
import { api } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Flex, Divider, Button, Tabs } from '@redpanda-data/ui';

@observer
class ConsumerGroupDetails extends PageComponent<{ groupId: string }> {
    initPage(p: PageInitHelper): void {
        const group = decodeURIComponent(this.props.groupId);

        p.title = 'Consumer Group ' + group;
        p.addBreadcrumb('Consumer Groups', '/groups');
        if (group) p.addBreadcrumb(group, '/' + group, {
            canBeCopied: true,
            canBeTruncated: true,
        });

        // this.refreshData(true);
        // appGlobal.onRefresh = () => this.refreshData(true);
    }

    @computed get group() {
        const groupId = decodeURIComponent(this.props.groupId);
        return api.consumerGroups.get(groupId);
    }


    render() {
        if (api.consumerGroups.size == 0) return DefaultSkeleton;
        const group = this.group;
        if (!group) return DefaultSkeleton;

        return (
            <PageContent key="b">
                {/* Statistics Bar */}
                <Flex gap="1rem" alignItems="center">
                    <SmallStat title="State">{group.state}</SmallStat>
                    <Divider height="2ch" orientation="vertical" />

                    <SmallStat title="Protocol">{group.protocol}</SmallStat>
                    <Divider height="2ch" orientation="vertical" />

                    <SmallStat title="Protocol Type">{group.protocolType}</SmallStat>
                    <Divider height="2ch" orientation="vertical" />

                    <SmallStat title="Coordinator ID">{group.coordinatorId}</SmallStat>
                </Flex>

                {/* Buttons */}
                <Flex gap="2">
                    <Button variant="outline">
                        Edit group
                    </Button>
                    <Button variant="outline">
                        Delete group
                    </Button>
                </Flex>

                {/* Topics & ACLs tabs */}
                <Tabs
                    isFitted
                    items={[
                        {
                            key: 'topics',
                            name: 'Topics',
                            component: <></>
                        },
                        {
                            key: 'acls',
                            name: 'ACLs',
                            component: <></>
                        }
                    ]} />
            </PageContent>
        );
    }
}

const ConsumerGroupTopicsTab = observer((p: { subject: SchemaRegistrySubjectDetails }) => {}

export default ConsumerGroupDetails;
