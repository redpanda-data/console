import { test, expect } from '@playwright/test';
import { createUser, deleteUser } from '../users.utils';
import { createRole, deleteRole } from '../roles.utils';

test.describe('Roles', () => {
    test('should create a role, check that no users were assigned', async ({page}) => {
        const roleName = 'role-name-no-users';

        await createRole(page, {roleName});

        await page.waitForURL(`/security/roles/${roleName}/details`);
        const userInfoEl = page.locator('text=\'This role is assigned to 0 members\'');
        await expect(userInfoEl).toBeVisible();  // Asserts that the element is visible

        await deleteRole(page, {roleName});
    });

    test('should create a role with users, check that these users were assigned', async ({page}) => {
        const roleName = 'role-name';
        const username = 'user-role-test';

        await createUser(page, {username});

        await page.goto('/security/roles', {
            waitUntil: 'domcontentloaded'
        });
        await page.getByTestId('create-role-button').click();

        await page.waitForURL('/security/roles/create');
        await page.getByLabel('Role name').fill(roleName);
        await page.getByTestId('roles-allow-all-operations').click();
        await page.getByLabel('Assign this role to principals').fill(username);
        await page.getByRole('button').getByText(username).click();

        await page.getByRole('button').getByText('Create').click();

        await page.waitForURL(`/security/roles/${roleName}/details`);
        const userInfoEl = page.locator('text=\'This role is assigned to 1 member\'');
        await expect(userInfoEl).toBeVisible();  // Asserts that the element is visible

        await deleteUser(page, {username});
        await deleteRole(page, {roleName});
    });

    test('should be able to search for role with regexp', async ({page}) => {
        const roleName1 = 'role-regexp-1';
        const roleName2 = 'role-regexp-2';
        const roleName3 = 'role-regexp-3';

        await createRole(page, {roleName: roleName1});
        await createRole(page, {roleName: roleName2});
        await createRole(page, {roleName: roleName3});

        await page.goto('/security/roles/', {
            waitUntil: 'domcontentloaded'
        });
        await page.getByPlaceholder('Enter search term/regex').fill('role-regexp-[1,2]');

        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/roles/${roleName1}/details']`).count()).toEqual(1);
        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/roles/${roleName2}/details']`).count()).toEqual(1);
        expect(await page.getByTestId('data-table-cell').locator(`a[href='/security/roles/${roleName3}/details']`).count()).toEqual(0);

        await deleteRole(page, {roleName: roleName1});
        await deleteRole(page, {roleName: roleName2});
        await deleteRole(page, {roleName: roleName3});
    });

    test('Allow All Operations in Roles should pre-set the form', async ({page}) => {
        await page.goto('/security/roles/create');
        await page.getByTestId('roles-allow-all-operations').click();
        expect(await page.getByTestId('create-role-topics-section').getByRole('textbox').nth(0).inputValue()).toBe('*');
        expect(await page.getByTestId('create-role-consumer-groups-section').getByRole('textbox').nth(0).inputValue()).toBe('*');
        expect(await page.getByTestId('create-role-transactional-ids-section').getByRole('textbox').nth(0).inputValue()).toBe('*');
    });

    test('should have disabled input field for name if the role exists', async ({page}) => {
        const roleName = 'edited-role';

        await createRole(page, {roleName});
        await page.goto(`/security/roles/${roleName}/edit`, {
            waitUntil: 'domcontentloaded'
        });

        await expect(page.getByTestId('create-role__role-name')).toBeDisabled();

        await deleteRole(page, {roleName});
    });
});