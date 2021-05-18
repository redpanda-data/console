import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import TopicAclList from './TopicAclList';
import { observable } from 'mobx';
import { ResourcePatternType } from '../../../../state/restInterfaces';

// interface AclResponse {
//     aclResources: AclResource[];
//     isAuthorizerEnabled: boolean;
// }
//
// enum ResourcePatternType {
//     'UNKNOWN', 'MATCH', 'LITERAL', 'PREFIXED'
// }
// interface AclResource {
//     resourceType: string;
//     resourceName: string;
//     resourcePatternType: ResourcePatternType;
//     acls: AclRule[];
// }

// interface AclRule {
//     principal: string;
//     host: string;
//     operation: string;
//     permissionType: string;
// }

it('renders an empty table when no data is present', () => {
    const store = observable({
        isAuthorizerEnabled: true,
        aclResources: [],
    });

    const { getByText } = render(<TopicAclList topicAcls={store} />);
    expect(getByText('No Data')).toBeInTheDocument();
});

it('a table with one entry', () => {
    const store = observable({
        isAuthorizerEnabled: true,
        aclResources: [
            {
                resourceType: 'Topic',
                resourceName: 'Test Topic',
                resourcePatternType: ResourcePatternType.UNKNOWN,
                acls: [
                    {
                        principal: 'test principal',
                        host: 'test host',
                        operation: 'test operation',
                        permissionType: 'test permission type',
                    },
                ],
            },
        ],
    });

    const { getByText } = render(<TopicAclList topicAcls={store} />);

    expect(getByText('Topic')).toBeInTheDocument();
    expect(getByText('Test Topic')).toBeInTheDocument();
    expect(getByText('0')).toBeInTheDocument();
    expect(getByText('test principal')).toBeInTheDocument();
    expect(getByText('test host')).toBeInTheDocument();
    expect(getByText('test operation')).toBeInTheDocument();
    expect(getByText('test permission type')).toBeInTheDocument();
});

it('informs user about missing permission to view ACLs', () => {
    const { getByText } = render(<TopicAclList topicAcls={null} />);
    expect(getByText('You do not have the necessary permissions to view ACLs')).toBeInTheDocument();
});

it('informs user about missing authorizer config in Kafka cluster', () => {
    const store = observable({
        isAuthorizerEnabled: false,
        aclResources: [],
    });

    const { getByText } = render(<TopicAclList topicAcls={store} />);
    expect(getByText("There's no authorizer configured in your Kafka cluster")).toBeInTheDocument();
});
