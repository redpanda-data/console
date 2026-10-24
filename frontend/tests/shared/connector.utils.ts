import { expect, type Page, step } from './e2e';

// Placeholder S3 settings: the form only needs non-empty values to create the connector.
const ACCESS_KEY = 'accesskey';
const SECRET_ACCESS_KEY = 'secretaccesskey';
const S3_BUCKET_NAME = 's3bucketname';

/** Expects the button to be visible and enabled, then clicks it. */
const clickWhenEnabled = async (page: Page, name: string) => {
  const button = page.getByRole('button', { name });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
};

const openS3ConnectorForm = async (page: Page, clusterName: string) => {
  await page.goto(`/connect-clusters/${clusterName}`);
  await page.waitForURL(`/connect-clusters/${clusterName}`, {
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Create connector', exact: true }).click();

  await page.getByTestId('search-field-input').fill('s3');
  await page.getByText('S3', { exact: true }).click();
};

/** The input of a connector form property, by the `property-<name>` wrapper the form renders. */
const propertyInput = (page: Page, property: string) => page.getByTestId(`property-${property}`).locator('input');

const fillS3Credentials = async (page: Page) => {
  await propertyInput(page, 'aws.access.key.id').fill(ACCESS_KEY);
  await propertyInput(page, 'aws.secret.access.key').fill(SECRET_ACCESS_KEY);
  await propertyInput(page, 'aws.s3.bucket.name').fill(S3_BUCKET_NAME);
};

const fillConnectorName = async (page: Page, connectorName: string) => {
  const connectorInput = propertyInput(page, 'name');
  await connectorInput.scrollIntoViewIfNeeded();
  await connectorInput.clear();
  await connectorInput.fill(connectorName);
  await expect(connectorInput).toHaveValue(connectorName, {
    timeout: 2000,
  });
  await connectorInput.blur();
};

export const createConnector = async (
  page: Page,
  { clusterName, connectorName }: { clusterName: string; connectorName: string }
) =>
  await step('Create connector', async () => {
    await openS3ConnectorForm(page, clusterName);
    await fillS3Credentials(page);
    await fillConnectorName(page, connectorName);

    await clickWhenEnabled(page, 'Next');
    await clickWhenEnabled(page, 'Create');

    await page.waitForURL(`/connect-clusters/${clusterName}/${connectorName}`, {
      timeout: 15_000,
    });
  });

export const deleteConnector = async (
  page: Page,
  { clusterName, connectorName }: { clusterName: string; connectorName: string }
) =>
  await step('Delete connector', async () => {
    await page.goto(`/connect-clusters/${clusterName}/${connectorName}`);

    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yes' })).toBeEnabled();

    await page.getByRole('button', { name: 'Yes' }).click();

    await expect(page.getByText('Deleted connector')).toBeVisible();
  });
