import { NavLink, Outlet } from 'react-router-dom';
import { Target, Upload, Settings, BarChart3 } from 'lucide-react';

export default function Layout() {
  const navItems = [
    { name: 'Pipeline', path: '/', icon: BarChart3 },
    { name: 'Import', path: '/import', icon: Upload },
    { name: 'ICP Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo / Brand */}
              <div className="brand-mark">
                <span className="brand-icon"><Target size={17} /></span>
                <span className="brand-name">SaaSQuatch</span>
                <span className="brand-context">Lead intelligence</span>
              </div>
              
              {/* Nav Links */}
              <nav className="primary-nav" aria-label="Primary navigation">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      className={({ isActive }) =>
                        `nav-link ${
                          isActive
                            ? 'nav-link-active'
                            : ''
                        }`
                      }
                    >
                      <Icon size={16} />
                      {item.name}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="shell page-content">
        <Outlet />
      </main>
    </div>
  );
}
