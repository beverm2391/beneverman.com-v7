import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import type { RouteObject } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

if (__VERCEL_PRODUCTION_DEPLOY__) {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} else {
  const { createBrowserRouter, RouterProvider } = await import('react-router-dom')
  const Lab = lazy(() => import('./lab/Lab.tsx'))
  // Scene selection lives in-app (?scene=<id>), so the lab is a single route.
  const labRoutes: RouteObject[] = [
    {
      path: '/lab',
      element: (
        <Suspense fallback={null}>
          <Lab />
        </Suspense>
      ),
    },
  ]

  // App still owns /, /source, /sun-icon, and ?debug via its own internal
  // pathname checks; the catch-all hands everything else to it unchanged.
  const router = createBrowserRouter([...labRoutes, { path: '*', element: <App /> }])

  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
