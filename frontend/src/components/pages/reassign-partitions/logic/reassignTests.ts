import { api } from "../../../../state/backendApi";
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

export function doTest() {
    const topics = api.topics;


    //computeReassignments();
}