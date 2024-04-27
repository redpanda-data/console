import { Page } from '@playwright/test';

export const createRole = async(page: Page, { roleName }: {roleName: string}) => {
    await page.goto('/security/roles');
    await page.getByTestId('create-role-button').click();

    await page.waitForURL('/security/roles/create')
    await page.getByLabel('Role name').fill(roleName);
    await page.getByTestId('roles-allow-all-operations').click()
    await page.getByRole('button').getByText('Create').click()
    return await page.waitForURL(`/security/roles/${roleName}/details`, {
        timeout: 5000
    });
}

export const deleteRole = async(page: Page, { roleName }: {roleName: string}) => {
    await page.goto(`/security/roles/${roleName}/details`)
    await page.getByRole('button').getByText('Delete').click()
    await page.getByPlaceholder(`Type "${roleName}" to confirm`).fill(roleName);
    await page.getByTestId('test-delete-item').click();
    return await page.waitForURL(`/security/roles/${roleName}/details`)
}