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

import { useState } from 'react';
import { observer } from 'mobx-react';
import { Select, Modal, AutoComplete } from 'antd';
import { api } from '../../../state/backendApi';
import { AclOperation, AclStrOperation, AclStrResourceType } from '../../../state/restInterfaces';
import { AnimatePresence, animProps_radioOptionGroup, MotionDiv } from '../../../utils/animationProps';
import { containsIgnoreCase } from '../../../utils/utils';
import { Code, Label, LabelTooltip } from '../../../utils/tsxUtils';
import { HiOutlineTrash } from 'react-icons/hi';
import { AclPrincipalGroup, createEmptyConsumerGroupAcl, createEmptyTopicAcl, createEmptyTransactionalIdAcl, ResourceACLs, unpackPrincipalGroup } from './Models';
import { Operation } from './Operation';
import { Button, Icon, Input, InputGroup, useToast } from '@redpanda-data/ui';
const { Option } = Select;


export const AclPrincipalGroupEditor = observer((p: {
    principalGroup: AclPrincipalGroup,
    type: 'create' | 'edit',
    onClose: () => void
}) => {
    const group = p.principalGroup;
    const toast = useToast()

    const existingPrincipals: string[] = [];
    const principalOptions = existingPrincipals.map(p => ({ value: p }));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(undefined as string | undefined);

    return (
        <Modal
            title={p.type == 'create' ? 'Create ACL' : 'Edit ACL'}
            style={{ top: '50px' }}
            width="1100px"
            open={true}
            closable={false}
            maskClosable={false}
            confirmLoading={isLoading}
            onOk={async () => {
                setError(undefined);
                setIsLoading(true);
                try {
                    if (group.principalName.length == 0) throw new Error('The principal field can not be empty.');

                    const allToCreate = unpackPrincipalGroup(group);

                    if (allToCreate.length == 0)
                        if (p.type == 'create') throw new Error('Creating an ACL group requires at least one resource to be targetted. Topic/Group targets with an empty selector are not valid.');
                        else throw new Error('No targeted resources. You can delete this ACL group from the list view.');

                    // Delete all ACLs in group
                    if (p.type == 'edit') {
                        if (group.sourceEntries.length > 0)
                            await api.deleteACLs({
                                resourceType: 'Any',
                                resourceName: undefined,
                                resourcePatternType: 'Any',
                                principal: group.principalType + ':' + group.principalName,
                                host: group.host,
                                operation: 'Any',
                                permissionType: 'Any'
                            });
                    }

                    // Create all ACLs in group
                    const requests = allToCreate.map(x =>
                        api.createACL({
                            host: x.host,
                            principal: x.principal,
                            resourceType: x.resourceType,
                            resourceName: x.resourceName,
                            resourcePatternType: x.resourcePatternType as unknown as 'Literal' | 'Prefixed',
                            operation: x.operation as unknown as Exclude<AclStrOperation, 'Unknown' | 'Any'>,
                            permissionType: x.permissionType as unknown as 'Allow' | 'Deny'
                        })
                    );

                    const results = await Promise.allSettled(requests);
                    const rejected = results.filter(x => x.status == 'rejected');
                    if (rejected.length) {
                        console.error('some create acl requests failed', { results, rejected });
                        throw new Error(rejected.length + ' requests failed');
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setError(msg);
                    setIsLoading(false);
                    return;
                }

                if (p.type == 'create') {
                    toast({
                        status: 'success',
                        description: <span>
                            Created ACLs for principal <Code>{group.principalName}</Code>
                        </span>
                    });
                } else {
                    toast({
                        status: 'success',
                        description: <span>
                            Updated ACLs for principal <Code>{group.principalName}</Code>
                        </span>
                    });
                }

                setIsLoading(false);
                p.onClose();
            }}
            onCancel={p.onClose}
        >
            <div style={{ display: 'flex', gap: '1.5em', flexDirection: 'column' }}>
                <AnimatePresence>
                    {error && (
                        <MotionDiv animProps={animProps_radioOptionGroup} style={{ color: 'red', fontWeight: 500 }}>
                            Error: {error}
                        </MotionDiv>
                    )}
                </AnimatePresence>

                <div style={{ display: 'flex', gap: '2.5em', alignItems: 'flex-end' }}>
                    <Label
                        text="User / Principal"
                        textSuffix={
                            <LabelTooltip nowrap left maxW={500}>
                                The user that gets the permissions granted (or denied).
                                <br />
                                In Kafka this is referred to as the "principal".
                                <br />
                                Do not include the prefix so <code>my-user</code> instead of <code>User:my-user</code>.<br />
                                You can use <code>*</code> to target all users.
                            </LabelTooltip>
                        }
                    >
                        <InputGroup>
                            <Select
                                value={group.principalType}
                                onChange={x => (group.principalType = x)}
                                disabled
                                showArrow={false}
                                style={{
                                    width: '80px',
                                    background: 'hsl(0deg 0% 98%)',
                                    cursor: 'default'
                                }}
                            >
                                <Option value="User">User</Option>
                                {/* <Option value="Group">Group</Option> */}
                            </Select>
                            <AutoComplete
                                style={{ width: 260 }}
                                options={principalOptions}
                                filterOption={(inputValue, option) => containsIgnoreCase(option!.value, inputValue)}
                                value={group.principalName}
                                onChange={v => {
                                    if (v.includes(':')) return;
                                    group.principalName = v;
                                }}
                                {...{ spellCheck: false }}
                            />
                        </InputGroup>
                    </Label>

                    <Label
                        text="Host"
                        textSuffix={
                            <LabelTooltip nowrap left maxW={500}>
                                The host the user needs to connect from in order for the permissions to apply.
                                <br />
                                Can be set to left empty or set to <code>*</code> to allow any host.
                            </LabelTooltip>
                        }
                    >
                        <Input width="200px" value={group.host} onChange={e => (group.host = e.target.value)} spellCheck={false} />
                    </Label>

                    <Button
                        variant="outline"
                        onClick={() => {
                            if (group.topicAcls.length == 0) group.topicAcls.push(createEmptyTopicAcl());
                            group.topicAcls[0].selector = '*';
                            group.topicAcls[0].all = 'Allow';

                            if (group.consumerGroupAcls.length == 0) group.consumerGroupAcls.push(createEmptyConsumerGroupAcl());
                            group.consumerGroupAcls[0].selector = '*';
                            group.consumerGroupAcls[0].all = 'Allow';

                            if (group.transactionalIdAcls.length == 0) group.transactionalIdAcls.push(createEmptyTransactionalIdAcl());
                            group.transactionalIdAcls[0].selector = '*';
                            group.transactionalIdAcls[0].all = 'Allow';

                            group.clusterAcls.all = 'Allow';
                        }}
                    >
                        Allow all operations
                    </Button>
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '2em',
                        flexDirection: 'column',
                        maxHeight: 'calc(100vh - 300px)',
                        overflowY: 'auto',
                        paddingRight: '8px'
                    }}
                >
                    <section style={{ width: '100%' }}>
                        <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Topics</span>
                        <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                            {group.topicAcls.map((t, i) => (
                                <ResourceACLsEditor key={i} resourceType="Topic" resource={t} onDelete={() => group.topicAcls.remove(t)} />
                            ))}
                            <Button variant="outline" width="100%" onClick={() => group.topicAcls.push(createEmptyTopicAcl())}>
                                Add Topic ACL
                            </Button>
                        </div>
                    </section>

                    <section style={{ width: '100%' }}>
                        <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Consumer Groups</span>
                        <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                            {group.consumerGroupAcls.map((t, i) => (
                                <ResourceACLsEditor key={i} resourceType="Group" resource={t} onDelete={() => group.consumerGroupAcls.remove(t)} />
                            ))}
                            <Button variant="outline" width="100%" onClick={() => group.consumerGroupAcls.push(createEmptyConsumerGroupAcl())}>
                                Add Consumer Group ACL
                            </Button>
                        </div>
                    </section>

                    <section style={{ width: '100%' }}>
                        <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Transactional ID</span>
                        <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                            {group.transactionalIdAcls.map((t, i) => (
                                <ResourceACLsEditor key={i} resourceType="TransactionalID" resource={t} onDelete={() => group.transactionalIdAcls.remove(t)} />
                            ))}
                            <Button variant="outline" width="100%" onClick={() => group.transactionalIdAcls.push(createEmptyTransactionalIdAcl())}>
                                Add Transactional ID ACL
                            </Button>
                        </div>
                    </section>

                    <section style={{ width: '100%' }}>
                        <span style={{ marginBottom: '4px', fontWeight: 500, fontSize: '13px' }}>Cluster</span>
                        <div style={{ display: 'flex', gap: '1em', flexDirection: 'column' }}>
                            <ResourceACLsEditor resourceType="Cluster" resource={group.clusterAcls} />
                        </div>
                    </section>
                </div>
            </div>
        </Modal>
    );
});

const ResourceACLsEditor = observer((p: {
    resource: ResourceACLs,
    resourceType: AclStrResourceType,
    onDelete?: () => void
}) => {
    const res = p.resource;
    const isCluster = !('selector' in res);
    const isAllSet = res.all == 'Allow' || res.all == 'Deny';

    let resourceName = 'Cluster';
    if (p.resourceType == 'Topic') resourceName = 'Topic';
    if (p.resourceType == 'Group') resourceName = 'Consumer Group';
    if (p.resourceType == 'TransactionalID') resourceName = 'Transactional ID';

    return (
        <div
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'row',
                gap: '2.5em',
                padding: '1.5em',
                background: 'hsl(0deg 0% 97%)'
            }}
        >
            {isCluster ? (
                <div style={{ width: '300px' }}>
                    <b>Applies to whole cluster</b>
                </div>
            ) : (
                <Label
                    text={`Selector (${resourceName} Name)`}
                    style={{ width: '300px' }}
                    textSuffix={
                        <LabelTooltip nowrap left maxW={500}>
                            Other than just simply typing the name of a resource directly,
                            <br />
                            you can also use wildcard and prefix selectors.
                            <br />
                            <br />
                            Input <code>*</code> to match any name (wildcard).
                            <br />
                            Or speficy a prefix selector by adding a star at the end. <br />
                            For example <code>abc-*</code> would match any resource that starts with <code>abc-</code>.
                        </LabelTooltip>
                    }
                >
                    <>
                        <Input value={res.selector} onChange={e => (res.selector = e.target.value)} spellCheck={false} />
                        <span style={{ opacity: '0.5', fontSize: '10px', marginLeft: '2px' }}>{res.selector == '*' ? 'Wildcard / Any ' + resourceName : res.selector.endsWith('*') ? 'Prefix Selector' : 'Literal Selector'}</span>
                    </>
                </Label>
            )}

            <Label text="Operations">
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        rowGap: '8px',
                        columnGap: '20px',
                        flexWrap: 'wrap',
                        width: '100%',
                        maxHeight: '60px',
                        alignItems: 'flex-start'
                    }}
                >
                    <Operation
                        style={{
                            marginBottom: '30px', // force 'all' to appear separate
                            marginRight: '16px'
                        }}
                        operation={AclOperation.All}
                        value={res.all}
                        onChange={p => (res.all = p)}
                    />

                    {Object.entries(res.permissions)
                        .sort(([op1], [op2]) => op1.localeCompare(op2))
                        .map(([operation, permission]) => (
                            <Operation key={operation} operation={operation} value={isAllSet ? res.all : permission} onChange={p => ((res.permissions as any)[operation] = p)} disabled={isAllSet} />
                        ))}
                </div>
            </Label>

            {p.onDelete && (
                <AnimatePresence>
                    <Button variant="ghost" style={{ position: 'absolute', right: '8px', top: '8px', padding: '4px', color: 'rgb(0, 0, 0, 0.35)' }} onClick={p.onDelete}>
                        <Icon as={HiOutlineTrash} fontSize="22px" />
                    </Button>
                </AnimatePresence>
            )}
        </div>
    );
});
