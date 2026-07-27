import { Outlet, RouterProvider } from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';

import { NotFoundPage } from './components/misc/not-found-page';
import { routeTree } from './routeTree.gen';
import { createTestRouterFromFiles, render, renderWithFileRoutes, screen } from './test-utils';

routeTree.update({ component: Outlet });

describe('removed Console AI routes', () => {
  it.each([
    '/agents',
    '/knowledgebases',
    '/mcp-servers',
    '/transcripts',
  ])('keeps %s in the normal not-found flow without redirecting', async (path) => {
    const router = createTestRouterFromFiles(path);
    router.update({ defaultNotFoundComponent: NotFoundPage });

    await router.load();
    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId('not-found-page')).toBeVisible();
    expect(router.state.location.pathname).toBe(path);
    expect(router.state.matches.some((match) => match.globalNotFound)).toBe(true);
  });
});

describe('NotFoundPage', () => {
  it('provides an accessible back button', async () => {
    const user = userEvent.setup();
    const { router } = renderWithFileRoutes(<NotFoundPage />, { initialLocation: '/missing' });
    const back = vi.spyOn(router.history, 'back');

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(back).toHaveBeenCalledOnce();
  });

  it('offers a home link when browser history cannot go back', () => {
    renderWithFileRoutes(<NotFoundPage />, { initialLocation: '/missing' });

    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
  });
});
