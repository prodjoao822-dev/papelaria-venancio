import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function Layout() {
  const [sidebarAberta, setSidebarAberta] = useState(false)

  return (
    <div className="app-layout">
      <Sidebar aberta={sidebarAberta} onFechar={() => setSidebarAberta(false)} />
      <div className="app-content">
        <Header onToggleSidebar={() => setSidebarAberta((v) => !v)} />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
