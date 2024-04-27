import { test, expect } from '@playwright/test';
import { createUser, deleteUser } from '../users.utils';

test.describe('Users', () => {
    test('should create an user, check that user exists, user can be deleted', async ({page}) => {
        const username = 'user-2';

        await createUser(page, {username})

        const userInfoEl = page.locator('text=\'User created successfully\'');
        await expect(userInfoEl).toBeVisible({
            timeout: 3000
        });

        await deleteUser(page, {username})
    });

    test('should be able to search for an user with regexp', async ({page}) => {
        const userName1 = 'user-regexp-1';
        const userName2 = 'user-regexp-2';
        const userName3 = 'user-regexp-3';

        await createUser(page, {username: userName1});
        await createUser(page, {username: userName2});
        await createUser(page, {username: userName3});

        await page.goto('/security/users/', {
            waitUntil: 'domcontentloaded'
        });
        await page.getByPlaceholder('Enter search term/regex').fill('user-regexp-[1,2]');

        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/users/${userName1}/details']`).count()).toEqual(1);
        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/users/${userName2}/details']`).count()).toEqual(1);
        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/users/${userName3}/details']`).count()).toEqual(0);

        await deleteUser(page, {username: userName1});
        await deleteUser(page, {username: userName2});
        await deleteUser(page, {username: userName3});
    })
})
