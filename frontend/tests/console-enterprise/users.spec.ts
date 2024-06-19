import { test, expect } from '@playwright/test';
import { createUser, deleteUser } from '../users.utils';

test.describe('Users', () => {
    test('should create an user, check that user exists, user can be deleted', async ({page}) => {
        const username = 'user-2';

        await createUser(page, {username})

        const userInfoEl = page.locator('text=\'User created successfully\'');
        await expect(userInfoEl).toBeVisible();

        await deleteUser(page, {username})
    });

    test('should be able to search for an user with regexp', async ({page}) => {
        const r = (Math.random() + 1).toString(36).substring(7);

        const userName1 = `user-${r}-regexp-1`;
        const userName2 = `user-${r}-regexp-2`;
        const userName3 = `user-${r}-regexp-3`;

        await createUser(page, {username: userName1});
        await createUser(page, {username: userName2});
        await createUser(page, {username: userName3});

        await page.goto('/security/users/', {
            waitUntil: 'domcontentloaded'
        });
        await page.getByPlaceholder('Filter by name').fill(`user-${r}-regexp-[1,2]`);

        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/users/${userName1}/details']`).count()).toEqual(1);
        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/users/${userName2}/details']`).count()).toEqual(1);
        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/users/${userName3}/details']`).count()).toEqual(0);

        await deleteUser(page, {username: userName1});
        await deleteUser(page, {username: userName2});
        await deleteUser(page, {username: userName3});
    })
})
