import React, { useState, useRef, useMemo } from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence, useAnimation } from 'motion/react';
import { Sun, Moon, TrendingUp, Users, Leaf, DollarSign, MapPin, Activity } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import Logo from './Logo';
import { useMockStore } from '../../store';

const COLORS = ['#3b82f6', '#f43f5e'];

const HeroPhone: React.FC = React.memo(() => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { getRides, getParticipants } = useMockStore();
  
  const rides = getRides();
  const participants = getParticipants();

  const areaData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts: Record<string, number> = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0 };
    rides.forEach((r: any) => {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(r.departureTime).getDay()];
      counts[dayName]++;
    });
    
    let cumulative = 0;
    return days.map((day, i) => {
      // Add some random variation to make it look realistic, but keep overall trend growing
      const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
      cumulative += counts[day] + 2 + variation; 
      return { name: day, value: Math.max(0, cumulative) };
    });
  }, [rides]);

  const barData = useMemo(() => {
    const counts = { '8 AM': 0, '12 PM': 0, '5 PM': 0, '6 PM': 0 };
    let total = 0;
    rides.forEach((r: any) => {
      const hour = new Date(r.departureTime).getHours();
      if (hour >= 6 && hour < 10) counts['8 AM']++;
      else if (hour >= 10 && hour < 15) counts['12 PM']++;
      else if (hour >= 15 && hour < 17) counts['5 PM']++;
      else counts['6 PM']++;
      total++;
    });
    
    if (total === 0) {
      return [
        { name: '8 AM', value: 20 },
        { name: '12 PM', value: 30 },
        { name: '5 PM', value: 25 },
        { name: '6 PM', value: 25 },
      ];
    }
    
    return [
      { name: '8 AM', value: Math.round((counts['8 AM'] / total) * 100) },
      { name: '12 PM', value: Math.round((counts['12 PM'] / total) * 100) },
      { name: '5 PM', value: Math.round((counts['5 PM'] / total) * 100) },
      { name: '6 PM', value: Math.round((counts['6 PM'] / total) * 100) },
    ];
  }, [rides]);

  const stats = useMemo(() => {
    const uniqueUsers = new Set([
      ...participants.map((p: any) => p.userId),
      ...rides.map((r: any) => r.hostUserId)
    ]);
    
    const totalUsers = 21 + uniqueUsers.size;
    const totalRides = rides.length;
    const moneySaved = rides.reduce((acc: number, r: any) => acc + (r.estimatedTotalCost || 0), 0) * 0.45;
    const co2Reduced = rides.length * 5.2;

    return {
      users: totalUsers,
      rides: totalRides,
      saved: moneySaved,
      co2: co2Reduced
    };
  }, [rides, participants]);

  const pieData = useMemo(() => {
    const users = Array.from(new Set([
      ...participants.map((p: any) => p.userId),
      ...rides.map((r: any) => r.hostUserId)
    ]));
    
    let males = 0;
    let females = 0;
    users.forEach(u => {
      if (u.charCodeAt(u.length - 1) % 2 === 0) males++;
      else females++;
    });
    
    if (males === 0 && females === 0) {
      males = 1;
      females = 1;
    }

    return [
      { name: 'Males', value: males },
      { name: 'Females', value: females },
    ];
  }, [rides, participants]);

  // Mouse tracking for 3D effect - Optimized for stability and smoothness
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 40, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 40, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["2.5deg", "-2.5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-2.5deg", "2.5deg"]);

  const controls = useAnimation();
  const handleHoverStart = () => {
    controls.start({
      y: [0, -4, 0],
      transition: { duration: 0.6, ease: "easeInOut" }
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Clamp values to prevent extreme rotations
    const xPct = Math.max(-0.5, Math.min(0.5, mouseX / width - 0.5));
    const yPct = Math.max(-0.5, Math.min(0.5, mouseY / height - 0.5));
    
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center perspective-2000 overflow-visible p-4"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 3D Background Elements - Optimized for Performance & Positioned BEHIND */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* 3D Grid */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(to right, #000 1px, transparent 1px), 
                              linear-gradient(to bottom, #000 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
            transform: 'perspective(1000px) rotateX(60deg) translateY(-100px) translateZ(-400px)',
            maskImage: 'radial-gradient(circle at center, black, transparent 80%)',
          }}
        />

        {/* Dynamic 3D Geometric Shapes - Glassmorphism */}
        <div className="absolute inset-0 flex items-center justify-center perspective-1000">
          {/* Large Rotating Ring */}
          <motion.div
            className="absolute border-[1px] border-black/5 rounded-full"
            style={{
              width: 600,
              height: 600,
              translateZ: -400,
            }}
            animate={{
              rotateZ: 360,
              rotateX: [60, 70, 60],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: "linear",
            }}
          />

          {/* Floating Glass Panels */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={`shape-${i}`}
              className="absolute border border-black/5 bg-gradient-to-br from-black/[0.03] to-transparent backdrop-blur-[4px] shadow-2xl"
              style={{
                width: i % 2 === 0 ? 150 : 100,
                height: i % 2 === 0 ? 150 : 100,
                borderRadius: i % 3 === 0 ? '50%' : '32px',
                left: i % 2 === 0 ? `${5 + Math.random() * 30}%` : `${65 + Math.random() * 30}%`,
                top: `${15 + Math.random() * 70}%`,
                translateZ: `${-300 - i * 60}px`,
              }}
              animate={{
                rotateX: [0, 360],
                rotateY: [0, 360],
                y: [0, -60, 0],
                x: [0, 40, 0],
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 25 + i * 8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* Smaller Accent Rings */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={`ring-${i}`}
              className="absolute border-[1px] border-black/[0.03] rounded-full"
              style={{
                width: 400 + i * 100,
                height: 400 + i * 100,
                translateZ: -500,
              }}
              animate={{
                rotateZ: -360,
                rotateY: [0, 20, 0],
              }}
              transition={{
                duration: 40 + i * 10,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}

          {/* Wireframe Sphere Effect */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={`sphere-ring-${i}`}
              className="absolute border-[0.5px] border-black/[0.04] rounded-full"
              style={{
                width: 500,
                height: 500,
                translateZ: -450,
                rotateX: i * 30,
              }}
              animate={{
                rotateY: 360,
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}

          {/* Floating Vertical Lines */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={`line-${i}`}
              className="absolute bg-gradient-to-b from-transparent via-black/[0.05] to-transparent"
              style={{
                width: 1,
                height: 150 + Math.random() * 200,
                left: i % 2 === 0 ? `${5 + Math.random() * 35}%` : `${60 + Math.random() * 35}%`,
                top: `${10 + Math.random() * 80}%`,
                translateZ: `${-200 - Math.random() * 400}px`,
              }}
              animate={{
                y: [0, -300, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 15 + Math.random() * 15,
                repeat: Infinity,
                ease: "linear",
                delay: Math.random() * 10,
              }}
            />
          ))}
        </div>

        {/* Animated Dark Orbs */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={`orb-${i}`}
            className="absolute rounded-full blur-[100px] will-change-transform"
            style={{
              width: 500,
              height: 500,
              left: i % 2 === 0 ? '-10%' : '60%',
              top: i < 2 ? '-10%' : '60%',
              backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)',
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 10 + i * 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Subtle Glow behind the phone */}
        <motion.div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[800px] bg-black/[0.03] rounded-full blur-[120px]"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Floating Particles - Positioned BEHIND */}
        {[...Array(35)].map((_, i) => (
          <motion.div
            key={`p-${i}`}
            className="absolute w-1 h-1 bg-black/10 rounded-full"
            style={{
              left: i % 2 === 0 ? `${10 + Math.random() * 30}%` : `${60 + Math.random() * 30}%`,
              top: `${10 + Math.random() * 80}%`,
            }}
            animate={{
              y: [0, -200, 0],
              x: [0, (Math.random() - 0.5) * 150, 0],
              opacity: [0, 0.8, 0],
              scale: [0, 2.5, 0],
            }}
            transition={{
              duration: Math.random() * 8 + 5,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Main 3D Phone Container */}
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        animate={controls}
        onHoverStart={handleHoverStart}
        className="relative z-10 scale-[0.75] xl:scale-90 will-change-transform"
      >
        {/* iPhone Frame from Image */}
        <div className="relative w-[320px] h-[650px] flex items-center justify-center">
          {/* The Reference Image */}
          <img 
            src="/iPhone.png" 
            alt="iPhone" 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // Fallback if image is missing or empty
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.style.backgroundColor = '#080808';
              (e.target as HTMLImageElement).parentElement!.style.borderRadius = '58px';
            }}
          />

          {/* Screen Content - Positioned to fit inside the image's screen area */}
          <motion.div 
            className={`absolute inset-[10px] rounded-[48px] overflow-hidden z-10 transition-colors duration-500 outline-none ring-0 border-none ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}
          >
            {/* Dynamic Island */}
            <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-24 h-7 bg-black rounded-full z-50 flex items-center justify-end px-3 border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
            </div>

            {/* Mode Toggle Button - Higher and Smaller */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`absolute top-4 right-6 w-6 h-6 rounded-full flex items-center justify-center z-50 transition-all duration-300 ${
                isDarkMode ? 'text-yellow-400' : 'text-neutral-400'
              } hover:scale-110 active:scale-95`}
            >
              <AnimatePresence mode="wait">
                {isDarkMode ? (
                  <motion.div
                    key="sun"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sun size={14} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Moon size={14} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>

            {/* Scrollable Container */}
            <div className="absolute inset-0 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-8 pt-16 pb-2 flex flex-col items-center justify-start">
              {/* Screen Content */}
              <div className="w-full flex flex-col items-center justify-start relative z-10 min-h-full">
                {/* Header */}
                <div className="w-full flex items-center justify-between mb-4 px-2">
                <Logo imageClassName="w-8 h-8" />
                <div className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-black'}`}>Dashboard</div>
                <div className="w-8" /> {/* Spacer for balance */}
              </div>

              {/* Chart Section */}
              <div className={`w-full h-32 mb-4 rounded-2xl p-3 border transition-colors duration-500 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className={`text-[10px] font-medium ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Weekly Activity</div>
                  <div className="text-[10px] text-emerald-500 font-medium">+24%</div>
                </div>
                <div className="w-full h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={areaData}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="w-full grid grid-cols-2 gap-3 mb-4 px-2">
                <StatCard title="Total Users" value={stats.users.toString()} trend="+18%" icon={<Users size={12} />} isDarkMode={isDarkMode} />
                <StatCard title="Money Saved" value={`$${stats.saved.toFixed(2)}`} trend="+25%" icon={<DollarSign size={12} />} isDarkMode={isDarkMode} />
                <StatCard title="Rides Shared" value={stats.rides.toString()} trend="+12%" icon={<TrendingUp size={12} />} isDarkMode={isDarkMode} />
                <StatCard title="CO2 Reduced" value={`${stats.co2.toFixed(1)}kg`} trend="+7%" icon={<Leaf size={12} />} isDarkMode={isDarkMode} />
              </div>

              {/* Top Routes */}
              <div className="w-full flex flex-col gap-4 px-2 mb-6">
                <div className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>Top Routes</div>
                <RouteBar from="Boston College" to="Logan Airport" value={47} isDarkMode={isDarkMode} />
                <RouteBar from="Newton Campus" to="177 Huntington Avenue" value={36} isDarkMode={isDarkMode} />
                <RouteBar from="Boston College" to="South Station" value={17} isDarkMode={isDarkMode} />
              </div>

              {/* Bar Chart Section */}
              <div className={`w-full h-40 mb-6 rounded-2xl p-3 border transition-colors duration-500 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                <div className="flex justify-between items-center mb-2">
                  <div className={`text-[10px] font-medium ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Rides by Time of Day</div>
                </div>
                <div className="w-full h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 8, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} 
                        axisLine={false} 
                        tickLine={false} 
                        dy={5}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: isDarkMode ? '#171717' : '#fff', border: 'none', borderRadius: '8px', fontSize: '10px' }}
                        itemStyle={{ color: isDarkMode ? '#fff' : '#000' }}
                        cursor={{ fill: isDarkMode ? '#262626' : '#f5f5f5' }}
                        formatter={(value: number) => [`${value}%`, '']}
                      />
                      <Bar dataKey="value" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie Chart Section */}
              <div className={`w-full h-40 mb-6 rounded-2xl p-3 border transition-colors duration-500 flex items-center ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                <div className="w-1/2 h-full flex flex-col justify-center">
                  <div className={`text-[10px] font-medium mb-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>User Demographics</div>
                  <div className="flex flex-col gap-1">
                    {pieData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className={`text-[9px] ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-1/2 h-full flex items-center justify-center">
                  <PieChart width={80} height={80}>
                    <Pie
                      data={pieData}
                      cx={40}
                      cy={40}
                      innerRadius={20}
                      outerRadius={35}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
              </div>

              {/* Footer Text */}
              <div className={`mt-auto mb-0 pb-4 text-center transition-opacity duration-500 ${isDarkMode ? 'opacity-40' : 'opacity-30'}`}>
                <p className={`text-[9px] uppercase tracking-[0.25em] font-bold transition-colors duration-500 ${
                  isDarkMode ? 'text-white' : 'text-black'
                }`}>
                  Boston College Network
                </p>
                <div className={`h-[1px] w-4 mx-auto mt-2 transition-colors duration-500 ${
                  isDarkMode ? 'bg-white/20' : 'bg-black/20'
                }`} />
              </div>
            </div>
            </div>

            {/* Subtle Reflection Overlay */}
            <div className={`absolute inset-0 pointer-events-none bg-gradient-to-tr opacity-10 transition-all duration-500 ${
              isDarkMode ? 'from-white/5 via-transparent to-black/5' : 'from-black/5 via-transparent to-white/5'
            }`} />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
});









export default HeroPhone;

const StatCard = ({ title, value, trend, icon, isDarkMode }: any) => (
  <div className={`p-2 rounded-2xl flex flex-col gap-1 border transition-colors duration-500 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
    <div className={`flex items-center gap-1 text-[9px] font-medium ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
      {icon}
      <span className="truncate">{title}</span>
    </div>
    <div className="flex items-end justify-between mt-auto">
      <div className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>{value}</div>
      <div className="text-[9px] text-emerald-500 font-medium mb-0.5 whitespace-nowrap">{trend}</div>
    </div>
  </div>
);

const RouteBar = ({ from, to, value, isDarkMode }: any) => (
  <div className="w-full flex flex-col gap-1.5">
    <div className="w-full flex justify-between items-center">
      <div className={`flex items-center gap-1 text-[8px] font-medium ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'} truncate mr-2`}>
        <MapPin size={8} className="shrink-0" />
        <span className="truncate">{from}</span> <span className="opacity-50 mx-0.5 shrink-0">→</span> <span className="truncate">{to}</span>
      </div>
      <div className={`text-[10px] font-medium shrink-0 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>{value}%</div>
    </div>
    <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
        className="h-full bg-blue-500 rounded-full"
      />
    </div>
  </div>
);
