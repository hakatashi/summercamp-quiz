import {createBrowserRouter, RouterProvider} from 'react-router';
import {ToastProvider} from './components/Toast.tsx';
import {startClockSync} from './lib/clock.ts';
import {AdminPage} from './pages/AdminPage.tsx';
import {EditPage} from './pages/EditPage.tsx';
import {HostPage} from './pages/HostPage.tsx';
import {MonitorPage} from './pages/MonitorPage.tsx';
import {PlayPage} from './pages/PlayPage.tsx';
import {TopPage} from './pages/TopPage.tsx';

startClockSync();

const router = createBrowserRouter([
	{path: '/', element: <TopPage />},
	{path: '/admin', element: <AdminPage />},
	{path: '/games/:gameId/host', element: <HostPage />},
	{path: '/games/:gameId/play', element: <PlayPage />},
	{path: '/games/:gameId/monitor', element: <MonitorPage />},
	{path: '/games/:gameId/edit', element: <EditPage />},
]);

export const App = () => (
	<ToastProvider>
		<RouterProvider router={router} />
	</ToastProvider>
);
