import { computeReassignments } from "./reassignLogic";


/* Example1: traffic

    # Cluster "BD PRD"
    rackA: 0, 1
    rackB: 2, 3

    # Cluster expanded with new brokers (4,5,6)
    rackA: 0, 1, 4
    rackB: 2, 3, 5
    rackC:       6


    # Selection
    - TopicA, rf=3, currently on [0,1,2]
    - target brokers: [4,5,6]

    # Result
    Replicas should end up evenly distributed across all racks
    BUT:
        0 -> 4 (4 does not )
        2 -> 5
        1 -> 6 (unavoidable, )
*/
export function test1() {


    //computeReassignments();
}


/*
    Example 2:
    bd prd
    rackA:
        - 0
        - 1
                - 4 (new)
    rackB:
        - 2
        - 3
                - 5 (new)
    rackC:
                - 6 (new)

    - TopicA, rf=2, currently on [0,2]

    move to new brokers [4,5,6]
    rackA: 4   (10k partitions)
    rackB: 5   (0 partitions)
    rackC: 6   (0 partitions)

    # Result
    - 2 to 5
*/






const testData1 = {
    apiData: {
        "brokers": [
            {
                "brokerId": 0,
                "logDirSize": 1549324103,
                "address": "broker-0.localhost",
                "rack": "europe-west1-c"
            },
            {
                "brokerId": 1,
                "logDirSize": 1548622760,
                "address": "broker-1.localhost",
                "rack": "europe-west1-b"
            },
            {
                "brokerId": 2,
                "logDirSize": 1562068308,
                "address": "broker-2.localhost",
                "rack": "europe-west1-d"
            }
        ],
        "topics": [
            {
                "topicName": "__consumer_offsets",
                "isInternal": true,
                "partitionCount": 50,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 983604,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "bons",
                "isInternal": false,
                "partitionCount": 10,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 0,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "customers",
                "isInternal": false,
                "partitionCount": 12,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 88803,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "orders-json",
                "isInternal": false,
                "partitionCount": 8,
                "replicationFactor": 3,
                "cleanupPolicy": "delete",
                "logDirSize": 5599965,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "owlshop-addresses",
                "isInternal": false,
                "partitionCount": 12,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 1618422699,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "owlshop-customers",
                "isInternal": false,
                "partitionCount": 12,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 1192177071,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "owlshop-frontend-events",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 3,
                "cleanupPolicy": "delete",
                "logDirSize": 10058190,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "owlshop-orders",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 1629325176,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "owlshop-orders-protobuf",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 3,
                "cleanupPolicy": "compact",
                "logDirSize": 64478391,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "re-test1-addresses",
                "isInternal": false,
                "partitionCount": 3,
                "replicationFactor": 1,
                "cleanupPolicy": "compact",
                "logDirSize": 4616196,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "re-test1-customers",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 1,
                "cleanupPolicy": "compact",
                "logDirSize": 4536109,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "re-test1-frontend-events",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 1,
                "cleanupPolicy": "delete",
                "logDirSize": 117024688,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "re-test1-orders",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 1,
                "cleanupPolicy": "compact",
                "logDirSize": 7072710,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "re-test1-orders-protobuf",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 1,
                "cleanupPolicy": "compact",
                "logDirSize": 5630813,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "recipes",
                "isInternal": false,
                "partitionCount": 6,
                "replicationFactor": 3,
                "cleanupPolicy": "delete",
                "logDirSize": 0,
                "allowedActions": [
                    "all"
                ]
            },
            {
                "topicName": "test_mp1",
                "isInternal": false,
                "partitionCount": 3,
                "replicationFactor": 3,
                "cleanupPolicy": "delete",
                "logDirSize": 756,
                "allowedActions": [
                    "all"
                ]
            }
        ],
        "topicPartitions": {
            "customers": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 17,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 4666
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 4666
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 4666
                        }
                    ],
                    "replicaSize": 4666,
                    "topicName": "customers"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 8,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 2201
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 2201
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 2201
                        }
                    ],
                    "replicaSize": 2201,
                    "topicName": "customers"
                },
                {
                    "id": 10,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 7,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 10,
                            "size": 1910
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 10,
                            "size": 1910
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 10,
                            "size": 1910
                        }
                    ],
                    "replicaSize": 1910,
                    "topicName": "customers"
                },
                {
                    "id": 8,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 9,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 8,
                            "size": 2452
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 8,
                            "size": 2452
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 8,
                            "size": 2452
                        }
                    ],
                    "replicaSize": 2452,
                    "topicName": "customers"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 8,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 2168
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 2168
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 2168
                        }
                    ],
                    "replicaSize": 2168,
                    "topicName": "customers"
                },
                {
                    "id": 9,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 9,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 9,
                            "size": 2481
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 9,
                            "size": 2481
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 9,
                            "size": 2481
                        }
                    ],
                    "replicaSize": 2481,
                    "topicName": "customers"
                },
                {
                    "id": 11,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 11,
                            "size": 1644
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 11,
                            "size": 1644
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 11,
                            "size": 1644
                        }
                    ],
                    "replicaSize": 1644,
                    "topicName": "customers"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 10,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 2710
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 2710
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 2710
                        }
                    ],
                    "replicaSize": 2710,
                    "topicName": "customers"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 8,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 2218
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 2218
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 2218
                        }
                    ],
                    "replicaSize": 2218,
                    "topicName": "customers"
                },
                {
                    "id": 6,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 10,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 6,
                            "size": 2792
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 6,
                            "size": 2792
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 6,
                            "size": 2792
                        }
                    ],
                    "replicaSize": 2792,
                    "topicName": "customers"
                },
                {
                    "id": 7,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 4,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 7,
                            "size": 1107
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 7,
                            "size": 1107
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 7,
                            "size": 1107
                        }
                    ],
                    "replicaSize": 1107,
                    "topicName": "customers"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 12,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 3252
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 3252
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 3252
                        }
                    ],
                    "replicaSize": 3252,
                    "topicName": "customers"
                }
            ],
            "bons": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 8,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 8,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 8,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 8,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 9,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 9,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 9,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 9,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 6,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 6,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 6,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 6,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 7,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 7,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 7,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 7,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "bons"
                }
            ],
            "__consumer_offsets": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 10,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 10,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 10,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 10,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 20,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 20,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 20,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 20,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 40,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 40,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 40,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 40,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 30,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 30,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 30,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 30,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 39,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 39,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 39,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 39,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 9,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 9,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 9,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 9,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 11,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 11,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 11,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 11,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 31,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 31,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 31,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 31,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 13,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 13,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 13,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 13,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 18,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 18,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 18,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 18,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 22,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 22,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 22,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 22,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 32,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 32,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 32,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 32,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 8,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 8,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 8,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 8,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 43,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 43,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 43,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 43,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 29,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 29,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 29,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 29,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 34,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 34,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 34,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 34,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 6,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 6,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 6,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 6,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 41,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 41,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 41,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 41,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 27,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 27,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 27,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 27,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 48,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 48,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 48,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 48,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 15,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 15,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 15,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 15,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 35,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 35,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 35,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 35,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 25,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 25,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 25,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 25,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 46,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 46,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 46,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 46,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 26,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 26,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 26,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 26,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 36,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 36,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 36,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 36,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 44,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 44,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 44,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 44,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 37,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 37,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 37,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 37,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 17,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 17,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 17,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 17,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 45,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 144484,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 45,
                            "size": 7281
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 45,
                            "size": 7281
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 45,
                            "size": 7281
                        }
                    ],
                    "replicaSize": 7281,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 16,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 16,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 16,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 16,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 24,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 24,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 24,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 24,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 38,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 38,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 38,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 38,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 33,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 33,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 33,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 33,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 23,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 23,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 23,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 23,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 28,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 28,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 28,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 28,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 12,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 1021,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 12,
                            "size": 168246
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 12,
                            "size": 168246
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 12,
                            "size": 168246
                        }
                    ],
                    "replicaSize": 168246,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 19,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 19,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 19,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 19,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 14,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 14,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 14,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 14,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 47,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 47,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 47,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 47,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 49,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 49,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 49,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 49,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 42,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 979,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 42,
                            "size": 152341
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 42,
                            "size": 152341
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 42,
                            "size": 152341
                        }
                    ],
                    "replicaSize": 152341,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 7,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 7,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 7,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 7,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                },
                {
                    "id": 21,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 21,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 21,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 21,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "__consumer_offsets"
                }
            ],
            "orders-json": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 11,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 183011
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 183011
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 183011
                        }
                    ],
                    "replicaSize": 183011,
                    "topicName": "orders-json"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 11,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 198293
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 198293
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 198293
                        }
                    ],
                    "replicaSize": 198293,
                    "topicName": "orders-json"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 16,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 290374
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 290374
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 290374
                        }
                    ],
                    "replicaSize": 290374,
                    "topicName": "orders-json"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 15,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 246930
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 246930
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 246930
                        }
                    ],
                    "replicaSize": 246930,
                    "topicName": "orders-json"
                },
                {
                    "id": 6,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 12,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 6,
                            "size": 260617
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 6,
                            "size": 260617
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 6,
                            "size": 260617
                        }
                    ],
                    "replicaSize": 260617,
                    "topicName": "orders-json"
                },
                {
                    "id": 7,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 16,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 7,
                            "size": 329516
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 7,
                            "size": 329516
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 7,
                            "size": 329516
                        }
                    ],
                    "replicaSize": 329516,
                    "topicName": "orders-json"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 12,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 160606
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 160606
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 160606
                        }
                    ],
                    "replicaSize": 160606,
                    "topicName": "orders-json"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 12,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 197308
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 197308
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 197308
                        }
                    ],
                    "replicaSize": 197308,
                    "topicName": "orders-json"
                }
            ],
            "owlshop-customers": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 336685,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 33123064
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 33123064
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 33123064
                        }
                    ],
                    "replicaSize": 33123064,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 337527,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 33146200
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 33146200
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 33146200
                        }
                    ],
                    "replicaSize": 33146200,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 10,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 337242,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 10,
                            "size": 33030169
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 10,
                            "size": 33030169
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 10,
                            "size": 33030169
                        }
                    ],
                    "replicaSize": 33030169,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 8,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 338032,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 8,
                            "size": 33234028
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 8,
                            "size": 33234028
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 8,
                            "size": 33234028
                        }
                    ],
                    "replicaSize": 33234028,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 337244,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 33182318
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 33182318
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 33182318
                        }
                    ],
                    "replicaSize": 33182318,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 9,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 336657,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 9,
                            "size": 33126817
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 9,
                            "size": 33126817
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 9,
                            "size": 33126817
                        }
                    ],
                    "replicaSize": 33126817,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 11,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 336820,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 11,
                            "size": 33076075
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 11,
                            "size": 33076075
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 11,
                            "size": 33076075
                        }
                    ],
                    "replicaSize": 33076075,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 336858,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 33108591
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 33108591
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 33108591
                        }
                    ],
                    "replicaSize": 33108591,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 337010,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 33047715
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 33047715
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 33047715
                        }
                    ],
                    "replicaSize": 33047715,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 6,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 337128,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 6,
                            "size": 33126002
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 6,
                            "size": 33126002
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 6,
                            "size": 33126002
                        }
                    ],
                    "replicaSize": 33126002,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 7,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 338261,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 7,
                            "size": 33122244
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 7,
                            "size": 33122244
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 7,
                            "size": 33122244
                        }
                    ],
                    "replicaSize": 33122244,
                    "topicName": "owlshop-customers"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 336279,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 33069134
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 33069134
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 33069134
                        }
                    ],
                    "replicaSize": 33069134,
                    "topicName": "owlshop-customers"
                }
            ],
            "owlshop-addresses": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 136134,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 44939154
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 44939154
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 44939154
                        }
                    ],
                    "replicaSize": 44939154,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 134992,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 44857671
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 44857671
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 44857671
                        }
                    ],
                    "replicaSize": 44857671,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 10,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135740,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 10,
                            "size": 44953039
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 10,
                            "size": 44953039
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 10,
                            "size": 44953039
                        }
                    ],
                    "replicaSize": 44953039,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135082,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 44817654
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 44817654
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 44817654
                        }
                    ],
                    "replicaSize": 44817654,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 8,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 136220,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 8,
                            "size": 45169841
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 8,
                            "size": 45169841
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 8,
                            "size": 45169841
                        }
                    ],
                    "replicaSize": 45169841,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 9,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135843,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 9,
                            "size": 44927121
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 9,
                            "size": 44927121
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 9,
                            "size": 44927121
                        }
                    ],
                    "replicaSize": 44927121,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 11,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 136154,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 11,
                            "size": 45145298
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 11,
                            "size": 45145298
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 11,
                            "size": 45145298
                        }
                    ],
                    "replicaSize": 45145298,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135615,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 44962987
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 44962987
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 44962987
                        }
                    ],
                    "replicaSize": 44962987,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135736,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 44965367
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 44965367
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 44965367
                        }
                    ],
                    "replicaSize": 44965367,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 6,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135773,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 6,
                            "size": 44933782
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 6,
                            "size": 44933782
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 6,
                            "size": 44933782
                        }
                    ],
                    "replicaSize": 44933782,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 7,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135846,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 7,
                            "size": 45030277
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 7,
                            "size": 45030277
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 7,
                            "size": 45030277
                        }
                    ],
                    "replicaSize": 45030277,
                    "topicName": "owlshop-addresses"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 135435,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 44772042
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 44772042
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 44772042
                        }
                    ],
                    "replicaSize": 44772042,
                    "topicName": "owlshop-addresses"
                }
            ],
            "owlshop-orders": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 38046,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 90689447
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 90689447
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 90689447
                        }
                    ],
                    "replicaSize": 90689447,
                    "topicName": "owlshop-orders"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 37485,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 89607093
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 89607093
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 89607093
                        }
                    ],
                    "replicaSize": 89607093,
                    "topicName": "owlshop-orders"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 37863,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 90559638
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 90559638
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 90559638
                        }
                    ],
                    "replicaSize": 90559638,
                    "topicName": "owlshop-orders"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 37883,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 90814940
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 90814940
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 90814940
                        }
                    ],
                    "replicaSize": 90814940,
                    "topicName": "owlshop-orders"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 38039,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 91041629
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 91041629
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 91041629
                        }
                    ],
                    "replicaSize": 91041629,
                    "topicName": "owlshop-orders"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 37743,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 90395645
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 90395645
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 90395645
                        }
                    ],
                    "replicaSize": 90395645,
                    "topicName": "owlshop-orders"
                }
            ],
            "owlshop-frontend-events": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 5556,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 1058026
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 1058026
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 1058026
                        }
                    ],
                    "replicaSize": 1058026,
                    "topicName": "owlshop-frontend-events"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 1631,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 313785
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 313785
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 313785
                        }
                    ],
                    "replicaSize": 313785,
                    "topicName": "owlshop-frontend-events"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 5468,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 1041027
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 1041027
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 1041027
                        }
                    ],
                    "replicaSize": 1041027,
                    "topicName": "owlshop-frontend-events"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 700,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 133775
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 133775
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 133775
                        }
                    ],
                    "replicaSize": 133775,
                    "topicName": "owlshop-frontend-events"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 2037,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 391598
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 391598
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 391598
                        }
                    ],
                    "replicaSize": 391598,
                    "topicName": "owlshop-frontend-events"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 2178,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 414519
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 414519
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 414519
                        }
                    ],
                    "replicaSize": 414519,
                    "topicName": "owlshop-frontend-events"
                }
            ],
            "owlshop-orders-protobuf": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 2092,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 3658905
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 3658905
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 3658905
                        }
                    ],
                    "replicaSize": 3658905,
                    "topicName": "owlshop-orders-protobuf"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 2060,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 3661021
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 3661021
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 3661021
                        }
                    ],
                    "replicaSize": 3661021,
                    "topicName": "owlshop-orders-protobuf"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 1959,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 3395958
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 3395958
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 3395958
                        }
                    ],
                    "replicaSize": 3395958,
                    "topicName": "owlshop-orders-protobuf"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 2121,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 3772011
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 3772011
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 3772011
                        }
                    ],
                    "replicaSize": 3772011,
                    "topicName": "owlshop-orders-protobuf"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 2003,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 3504748
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 3504748
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 3504748
                        }
                    ],
                    "replicaSize": 3504748,
                    "topicName": "owlshop-orders-protobuf"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 1976,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 3500154
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 3500154
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 3500154
                        }
                    ],
                    "replicaSize": 3500154,
                    "topicName": "owlshop-orders-protobuf"
                }
            ],
            "re-test1-addresses": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 5534,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 1521237
                        }
                    ],
                    "replicaSize": 1521237,
                    "topicName": "re-test1-addresses"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 5617,
                    "replicas": [
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 1539013
                        }
                    ],
                    "replicaSize": 1539013,
                    "topicName": "re-test1-addresses"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 5682,
                    "replicas": [
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        0
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 1555946
                        }
                    ],
                    "replicaSize": 1555946,
                    "topicName": "re-test1-addresses"
                }
            ],
            "re-test1-frontend-events": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 97347,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 18728245
                        }
                    ],
                    "replicaSize": 18728245,
                    "topicName": "re-test1-frontend-events"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 104561,
                    "replicas": [
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        0
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 20106792
                        }
                    ],
                    "replicaSize": 20106792,
                    "topicName": "re-test1-frontend-events"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 101728,
                    "replicas": [
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 19588019
                        }
                    ],
                    "replicaSize": 19588019,
                    "topicName": "re-test1-frontend-events"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 106990,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 20563122
                        }
                    ],
                    "replicaSize": 20563122,
                    "topicName": "re-test1-frontend-events"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 98324,
                    "replicas": [
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 18930477
                        }
                    ],
                    "replicaSize": 18930477,
                    "topicName": "re-test1-frontend-events"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 99166,
                    "replicas": [
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        0
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 19108033
                        }
                    ],
                    "replicaSize": 19108033,
                    "topicName": "re-test1-frontend-events"
                }
            ],
            "re-test1-customers": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6568,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 763446
                        }
                    ],
                    "replicaSize": 763446,
                    "topicName": "re-test1-customers"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6442,
                    "replicas": [
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        0
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 748907
                        }
                    ],
                    "replicaSize": 748907,
                    "topicName": "re-test1-customers"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6581,
                    "replicas": [
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 780874
                        }
                    ],
                    "replicaSize": 780874,
                    "topicName": "re-test1-customers"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6413,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 743850
                        }
                    ],
                    "replicaSize": 743850,
                    "topicName": "re-test1-customers"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6576,
                    "replicas": [
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        0
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 759540
                        }
                    ],
                    "replicaSize": 759540,
                    "topicName": "re-test1-customers"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 6350,
                    "replicas": [
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 739492
                        }
                    ],
                    "replicaSize": 739492,
                    "topicName": "re-test1-customers"
                }
            ],
            "re-test1-orders": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 451,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 1167126
                        }
                    ],
                    "replicaSize": 1167126,
                    "topicName": "re-test1-orders"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 433,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 1139698
                        }
                    ],
                    "replicaSize": 1139698,
                    "topicName": "re-test1-orders"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 466,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 1185358
                        }
                    ],
                    "replicaSize": 1185358,
                    "topicName": "re-test1-orders"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 465,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 1193119
                        }
                    ],
                    "replicaSize": 1193119,
                    "topicName": "re-test1-orders"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 456,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 1148823
                        }
                    ],
                    "replicaSize": 1148823,
                    "topicName": "re-test1-orders"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 497,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 1238586
                        }
                    ],
                    "replicaSize": 1238586,
                    "topicName": "re-test1-orders"
                }
            ],
            "re-test1-orders-protobuf": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 451,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 927904
                        }
                    ],
                    "replicaSize": 927904,
                    "topicName": "re-test1-orders-protobuf"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 433,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 910525
                        }
                    ],
                    "replicaSize": 910525,
                    "topicName": "re-test1-orders-protobuf"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 466,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 943376
                        }
                    ],
                    "replicaSize": 943376,
                    "topicName": "re-test1-orders-protobuf"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 465,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 948060
                        }
                    ],
                    "replicaSize": 948060,
                    "topicName": "re-test1-orders-protobuf"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 456,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 913285
                        }
                    ],
                    "replicaSize": 913285,
                    "topicName": "re-test1-orders-protobuf"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 496,
                    "replicas": [
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 987663
                        }
                    ],
                    "replicaSize": 987663,
                    "topicName": "re-test1-orders-protobuf"
                }
            ],
            "recipes": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        2,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "recipes"
                },
                {
                    "id": 5,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 5,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 5,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 5,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "recipes"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        1,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "recipes"
                },
                {
                    "id": 4,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 4,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 4,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 4,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "recipes"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        0,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "recipes"
                },
                {
                    "id": 3,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 3,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 3,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 3,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "recipes"
                }
            ],
            "test_mp1": [
                {
                    "id": 0,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 3,
                    "replicas": [
                        0,
                        1,
                        2
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 0,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 0,
                            "size": 252
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 0,
                            "size": 252
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 0,
                            "size": 252
                        }
                    ],
                    "replicaSize": 252,
                    "topicName": "test_mp1"
                },
                {
                    "id": 2,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        1,
                        2,
                        0
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 1,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 2,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 2,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "test_mp1"
                },
                {
                    "id": 1,
                    "waterMarkLow": 0,
                    "waterMarkHigh": 0,
                    "replicas": [
                        2,
                        0,
                        1
                    ],
                    "offlineReplicas": null,
                    "inSyncReplicas": [
                        2,
                        0,
                        1
                    ],
                    "leader": 2,
                    "partitionLogDirs": [
                        {
                            "error": "",
                            "brokerId": 0,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 1,
                            "partitionId": 1,
                            "size": 0
                        },
                        {
                            "error": "",
                            "brokerId": 2,
                            "partitionId": 1,
                            "size": 0
                        }
                    ],
                    "replicaSize": 0,
                    "topicName": "test_mp1"
                }
            ]
        }
    },
    partitionSelection: {
        "re-test1-customers": [
            0,
            5,
            4,
            1,
            2,
            3
        ]
    },
    brokerSelection: [0, 1, 2],
    expectedResult: {
        "topics": [
            {
                "topicName": "re-test1-customers",
                "partitions": [
                    {
                        "partitionId": 0,
                        "replicas": [
                            2
                        ]
                    },
                    {
                        "partitionId": 1,
                        "replicas": [
                            2
                        ]
                    },
                    {
                        "partitionId": 2,
                        "replicas": [
                            0
                        ]
                    },
                    {
                        "partitionId": 3,
                        "replicas": [
                            1
                        ]
                    },
                    {
                        "partitionId": 4,
                        "replicas": [
                            1
                        ]
                    },
                    {
                        "partitionId": 5,
                        "replicas": [
                            0
                        ]
                    }
                ]
            }
        ]
    },
};