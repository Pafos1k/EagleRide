
import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { 
  HelpCircle, 
  Menu,
  X,
  User,
  Car,
  Search,
  Clock
} from 'lucide-react';
import Logo from './src/components/Logo';
import FindRides from './views/FindRides';
import CreateRide from './views/CreateRide';
import RideDetail from './views/RideDetail';
import Home from './views/Home';
import { safeReturnTo } from './shared/authReturn';
import Profile from './views/Profile';
import Dashboard from './views/Dashboard';
import About from './views/About';
import SignIn from './views/SignIn';
import { RequireAuth, useAuth } from './src/auth/AuthProvider';

const App: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user || location.pathname !== '/profile') return;
    try {
      const destination = sessionStorage.getItem('er_auth_return');
      if (destination) { sessionStorage.removeItem('er_auth_return'); navigate(safeReturnTo(destination), { replace: true }); }
    } catch { /* Optional navigation state only; no tokens are stored here. */ }
  }, [user, location.pathname, navigate]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isRequestRide = location.pathname === '/create';
  const isFindSplit = location.pathname === '/find';
  const isDashboard = location.pathname === '/dashboard';
  const isProfile = location.pathname === '/profile';
  const isAbout = location.pathname === '/about';

  // Automatically close mobile menu and reset scroll on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);

  // Close mobile menu on desktop viewport resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* EagleRide Header - Responsive Minimalist Uber-style navigation */}
      <header className="bg-black text-white h-20 flex items-center justify-between w-full sticky top-0 z-[100] px-4 sm:px-6 lg:px-8 border-b border-neutral-900">
        <div className="flex items-center space-x-2 sm:space-x-4 lg:space-x-6 shrink-0 min-w-0">
          <Link to="/" className="group shrink-0 focus:outline-none">
            <Logo 
              className="text-white" 
              imageClassName="w-[125px] sm:w-[155px] md:w-[170px] lg:w-[185px] h-[40px] sm:h-[48px] md:h-[54px] lg:h-[58px]" 
            />
          </Link>
          
          {/* Desktop Navigation Links (hidden on mobile, visible on tablet & desktop) */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-xs lg:text-sm font-semibold ml-1 lg:ml-2">
            <Link 
              to="/create"
              className={`px-3 lg:px-4 py-2 rounded-full transition-all whitespace-nowrap ${
                isRequestRide ? 'bg-white text-black font-bold shadow-sm' : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
              }`}
            >
              Request a ride
            </Link>
            <Link 
              to="/find" 
              className={`px-3 lg:px-4 py-2 rounded-full transition-all whitespace-nowrap ${
                isFindSplit ? 'bg-white text-black font-bold shadow-sm' : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
              }`}
            >
              Find a split
            </Link>
            <Link 
              to="/dashboard" 
              className={`px-3 lg:px-4 py-2 rounded-full transition-all whitespace-nowrap ${
                isDashboard ? 'bg-white text-black font-bold shadow-sm' : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
              }`}
            >
              Activity
            </Link>
          </nav>
        </div>

        {/* Right side actions */}
        <div className="flex items-center space-x-1 sm:space-x-3 text-sm font-medium shrink-0">
          <Link 
            to="/about" 
            className={`hidden lg:flex items-center px-3.5 py-2 rounded-full transition-colors whitespace-nowrap ${
              isAbout ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <HelpCircle size={17} className="mr-1.5" />
            <span>About</span>
          </Link>

          <Link 
            to={user ? "/profile" : "/signin"}
            className={`flex items-center px-2 sm:px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
              isProfile ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              isProfile ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-200'
            }`}>
              <User size={15} />
            </div>
            <span className="hidden sm:inline ml-2 text-xs lg:text-sm">{user ? 'Profile' : 'Sign in'}</span>
          </Link>

          {/* Mobile hamburger menu button */}
          <button 
            onClick={() => setMobileMenuOpen(prev => !prev)} 
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl text-neutral-200 hover:text-white hover:bg-neutral-900 transition-colors focus:outline-none ml-1"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Dropdown & Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-20 bg-black/60 backdrop-blur-sm z-[98] md:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Dropdown panel */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed top-20 left-0 right-0 bg-neutral-950/98 backdrop-blur-md border-b border-neutral-800 text-white z-[99] px-4 py-4 sm:px-6 sm:py-5 shadow-2xl md:hidden"
            >
              <div className="flex flex-col space-y-1.5 max-w-lg mx-auto">
                <Link
                  to="/create"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-xl text-[15px] font-semibold transition-all ${
                    isRequestRide 
                      ? 'bg-white text-black font-bold shadow-md' 
                      : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                  }`}
                >
                  <Car size={19} className={`mr-3.5 ${isRequestRide ? 'text-black' : 'text-neutral-400'}`} />
                  <span>Request a ride</span>
                </Link>

                <Link
                  to="/find"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-xl text-[15px] font-semibold transition-all ${
                    isFindSplit 
                      ? 'bg-white text-black font-bold shadow-md' 
                      : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                  }`}
                >
                  <Search size={19} className={`mr-3.5 ${isFindSplit ? 'text-black' : 'text-neutral-400'}`} />
                  <span>Find a split</span>
                </Link>

                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-xl text-[15px] font-semibold transition-all ${
                    isDashboard 
                      ? 'bg-white text-black font-bold shadow-md' 
                      : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                  }`}
                >
                  <Clock size={19} className={`mr-3.5 ${isDashboard ? 'text-black' : 'text-neutral-400'}`} />
                  <span>Activity</span>
                </Link>

                <div className="border-t border-neutral-800 my-1 pt-2 flex flex-col space-y-1.5">
                  <Link
                    to={user ? "/profile" : "/signin"}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-xl text-[15px] font-semibold transition-all ${
                      isProfile 
                        ? 'bg-neutral-800 text-white font-bold' 
                        : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                    }`}
                  >
                    <User size={19} className="mr-3.5 text-neutral-400" />
                    <span>{user ? 'Profile' : 'Sign in'}</span>
                  </Link>

                  <Link
                    to="/about"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-xl text-[15px] font-semibold transition-all ${
                      isAbout 
                        ? 'bg-neutral-800 text-white font-bold' 
                        : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                    }`}
                  >
                    <HelpCircle size={19} className="mr-3.5 text-neutral-400" />
                    <span>About EagleRide</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/find" element={<FindRides />} />
          <Route path="/create" element={<RequireAuth><CreateRide /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/ride/:id" element={<RideDetail />} />
          <Route path="/chat/:id" element={<RequireAuth><p className="p-8 text-center">Chat is not available yet. No messages are sent or stored.</p></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
