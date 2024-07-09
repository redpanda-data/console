// import { test } from '@playwright/test';
//
// import { transformsApi } from '../../src/state/backendApi';
// import { PartitionTransformStatus_PartitionStatus, TransformMetadata } from '../../src/protogen/redpanda/api/dataplane/v1alpha1/transform_pb';


/**
 *  TODO 1:
 *  need a way to run these without imports, as importing backendapi/transformsApi causes errors
 *
 *  TODO 2:
 *  once we can create transforms directly in the ui, we can do much more/better testing
 */

// function setTransformData(...transforms: TransformMetadata[]) {
//     transformsApi.transforms = [
//         ...transforms
//     ];
//     transformsApi.transformDetails.clear();
//     for (const t of transformsApi.transforms)
//         transformsApi.transformDetails.set(t.name, t);
// }
//
// const exampleTransformData = [
//     new TransformMetadata({
//         name: 'transform 1', inputTopicName: 'inputA', outputTopicNames: ['out1', 'out2', 'out3'],
//         statuses: [
//             { brokerId: 0, partitionId: 0, lag: 5, status: PartitionTransformStatus_PartitionStatus.RUNNING },
//             { brokerId: 0, partitionId: 1, lag: 0, status: PartitionTransformStatus_PartitionStatus.RUNNING },
//             { brokerId: 0, partitionId: 2, lag: 11, status: PartitionTransformStatus_PartitionStatus.RUNNING },
//         ]
//     }),
//     new TransformMetadata({
//         name: 'transform2', inputTopicName: 'inputB', outputTopicNames: ['out4', 'out5', 'out6'],
//         statuses: [
//             { brokerId: 0, partitionId: 0, lag: 5, status: PartitionTransformStatus_PartitionStatus.RUNNING },
//             { brokerId: 1, partitionId: 1, lag: 0, status: PartitionTransformStatus_PartitionStatus.ERRORED },
//             { brokerId: 0, partitionId: 2, lag: 11, status: PartitionTransformStatus_PartitionStatus.RUNNING },
//         ]
//     }),
// ];


// test.describe('Transforms', () => {
//
//     test('example data should render two entries', async ({ page }) => {
//
//         await page.goto('/transforms');
//         setTransformData(...exampleTransformData);
//
//         await page.getByText('Running').waitFor();
//         await page.getByText('Errored').waitFor();
//         await page.getByText('transform2').waitFor();
//
//     });
//
//     test('no data should redirect to setup', async ({ page }) => {
//         setTransformData();
//         await page.goto('/transforms');
//         setTransformData();
//
//         await page.getByText('Create and initialize a data transforms project').waitFor();
//     });
//
//     test('navigate on click', async ({ page }) => {
//         setTransformData(...exampleTransformData);
//         await page.goto('/transforms');
//         setTransformData(...exampleTransformData);
//         await page.goto('/transforms');
//
//         await page.getByText('Running').waitFor();
//
//         await page.getByText('transform 1').click();
//
//         await page.getByText('Input topic').waitFor();
//         await page.getByText('Output topics').waitFor();
//
//         // check if it is rendering the proper content
//         await page.getByText('inputA').waitFor();
//         await page.getByText('out1').waitFor();
//         await page.getByText('out2').waitFor();
//         await page.getByText('out3').waitFor();
//         await page.getByText('Running').waitFor();
//
//         // lag column
//         await page.getByText('11').waitFor();
//
//     });
// });
