import { NavLink, Outlet } from 'react-router-dom';
import { Target, Upload, Settings, BarChart2 } from 'lucide-react';

export default function Layout() {
  const navItems = [
    { name: 'Pipeline', path: '/', icon: BarChart2 },
    { name: 'Import', path: '/import', icon: Upload },
    { name: 'ICP Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo / Brand */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                <span className="font-bold text-xl tracking-tight text-gray-900">
                  SaaSQuatch
                </span>
              </div>
              
              {/* Nav Links */}
              <nav className="ml-10 flex space-x-8">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      className={({ isActive }) =>
                        `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 mr-2" />
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
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
