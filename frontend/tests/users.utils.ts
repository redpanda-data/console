import { Page } from '@playwright/test';

export const createUser = async(page: Page, { username }: {username: string}) => {
    await page.goto('/security/users');

    await page.getByTestId('create-user-button').click();

    await page.waitForURL('/security/users/create')
    await page.getByLabel('Username').fill(username);
    return await page.getByRole('button').getByText('Create').click({
        force: true
    })
}

export const deleteUser = async(page: Page, { username }: {username: string}) => {
    await page.goto(`/security/users/${username}/details`)
    await page.getByRole('button').getByText('Delete').click()
    await page.getByPlaceholder(`Type "${username}" to confirm`).fill(username);
    return await page.getByTestId('test-delete-item').click({
        force: true
    });
}
