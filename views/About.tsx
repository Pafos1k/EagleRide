import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Github, 
  Linkedin, 
  Heart, 
  ExternalLink, 
  Share2
} from 'lucide-react';
import { motion, type Variants } from 'motion/react';

const About: React.FC = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5, ease: "easeOut" }
    }
  };

  return (
    <motion.div 
      className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-12 sm:space-y-20"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Hero Header */}
      <motion.div className="text-center" variants={itemVariants}>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter mb-4 sm:mb-6">EagleRide</h1>
        <p className="text-base sm:text-xl text-neutral-500 max-w-2xl mx-auto leading-relaxed font-medium">
          A student-led initiative dedicated to simplifying travel for the Boston College community. 
          Connecting Eagles for safer, more affordable, and sustainable journeys.
        </p>
      </motion.div>

      {/* Developer Spotlight */}
      <motion.div className="relative group" variants={itemVariants}>
        <div className="absolute -inset-1 bg-gradient-to-r from-neutral-200 via-neutral-400 to-neutral-200 rounded-2xl sm:rounded-[2.5rem] blur opacity-25 group-hover:opacity-75 transition duration-500 group-hover:duration-200 group-hover:bg-gradient-to-r group-hover:from-neutral-300 group-hover:via-neutral-500 group-hover:to-neutral-300"></div>
        <div className="relative bg-white border border-neutral-200 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-10 shadow-xl overflow-hidden">
          <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-10">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-tr from-neutral-300 to-neutral-500 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-300 flex items-center justify-center border-4 border-white shadow-inner shrink-0 transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3 overflow-hidden">
                <img src="/Vlad.jpg" alt="Vladislav Hoila" className="w-full h-full object-cover" />
              </div>
            </div>
            
            <div className="flex-1 text-center md:text-left min-w-0">
              <div className="inline-block px-3 py-1 rounded-full bg-neutral-100 text-neutral-500 text-[10px] font-bold uppercase tracking-widest mb-3 sm:mb-4">
                Lead Developer & Founder
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-3 sm:mb-4 tracking-tight">Vladislav Hoila</h2>
              <p className="text-neutral-600 text-sm sm:text-base md:text-lg max-w-xl leading-relaxed">
                EagleRide was built from the ground up to solve a real problem for BC students. 
                As a fellow student, I wanted to create a platform that actually puts our community first, making travel more accessible and affordable for everyone. This project is a labor of love, dedicated to improving student life at Boston College.
              </p>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 sm:gap-6 mt-6 sm:mt-8">
                <a 
                  href="https://github.com/vladislavhoila" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-neutral-500 hover:text-black transition-colors font-semibold text-sm sm:text-base"
                >
                  <Github size={18} className="mr-2 sm:w-5 sm:h-5" /> GitHub
                </a>
                <a 
                  href="https://linkedin.com/in/vladislavhoila" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-neutral-500 hover:text-black transition-colors font-semibold text-sm sm:text-base"
                >
                  <Linkedin size={18} className="mr-2 sm:w-5 sm:h-5" /> LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Support the Mission Section - Adjusted layout */}
      <motion.section 
        className="bg-neutral-200 border border-neutral-300 rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12"
        variants={itemVariants}
      >
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center space-x-2 text-rose-500 font-bold uppercase tracking-widest text-xs">
            <Heart size={16} fill="currentColor" />
            <span>Non-Profit Initiative</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="space-y-4 sm:space-y-6 text-center md:text-left">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Support the Mission</h2>
            <p className="text-neutral-600 text-sm sm:text-base md:text-lg leading-relaxed">
              EagleRide is a 100% non-profit project. We don't run ads and we don't sell your data. 
              The platform's growth and maintenance depend entirely on the generosity of the community. 
              Your donations help cover server costs and keep the service free for everyone.
            </p>
          </div>
          
          <div className="bg-white p-5 sm:p-8 rounded-2xl border border-neutral-200 shadow-sm">
            <p className="text-xs sm:text-sm font-bold text-neutral-400 uppercase tracking-[0.2em] mb-4 sm:mb-6 text-center">Donation Methods</p>
            <div className="flex flex-col gap-3 sm:gap-4">
              <a href="https://venmo.com/vladislavhoila" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between bg-neutral-100 hover:bg-neutral-200 px-4 sm:px-6 py-3 sm:py-4 rounded-xl transition-all group">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <img src="/venmo.jpg" alt="Venmo" className="w-7 h-7 sm:w-8 sm:h-8 rounded-md" />
                  <span className="font-bold text-sm sm:text-base">Venmo</span>
                </div>
                <ExternalLink size={16} className="text-neutral-400 group-hover:text-black" />
              </a>
              <a href="https://cash.app/$vladislavhoila" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between bg-neutral-100 hover:bg-neutral-200 px-4 sm:px-6 py-3 sm:py-4 rounded-xl transition-all group">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <img src="/CashApp.jpg" alt="Cash App" className="w-7 h-7 sm:w-8 sm:h-8 rounded-md" />
                  <span className="font-bold text-sm sm:text-base">Cash App</span>
                </div>
                <ExternalLink size={16} className="text-neutral-400 group-hover:text-black" />
              </a>
              <a href="https://paypal.me/vladislavhoila" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between bg-neutral-100 hover:bg-neutral-200 px-4 sm:px-6 py-3 sm:py-4 rounded-xl transition-all group">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <img src="/PayPal.jpg" alt="PayPal" className="w-7 h-7 sm:w-8 sm:h-8 rounded-md" />
                  <span className="font-bold text-sm sm:text-base">PayPal</span>
                </div>
                <ExternalLink size={16} className="text-neutral-400 group-hover:text-black" />
              </a>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Community Growth Section - Narrower band design */}
      <motion.section 
        className="bg-neutral-900 text-white rounded-2xl sm:rounded-3xl p-6 sm:p-8"
        variants={itemVariants}
      >
        <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-8 text-center md:text-left">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <Share2 size={24} className="sm:w-7 sm:h-7" />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Community Growth is Vital</h3>
            <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl">
              The more Eagles join, the better the platform functions for everyone. Share EagleRide with your friends!
            </p>
          </div>
        </div>
      </motion.section>

      {/* Safety & Standards */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12" variants={itemVariants}>
        <div className="space-y-4 sm:space-y-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black text-white rounded-2xl flex items-center justify-center">
            <ShieldCheck size={20} className="sm:w-6 sm:h-6" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">The Eagle Standard</h2>
          <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
            Trust is our foundation. We maintain high standards of reliability and safety 
            to ensure every journey is a positive experience for the community.
          </p>
          <ul className="space-y-3 sm:space-y-4">
            <li className="flex items-start">
              <div className="mt-1 mr-3 text-emerald-500 shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="font-bold text-sm sm:text-base">Verified Community</p>
                <p className="text-xs sm:text-sm text-neutral-500">Exclusively for students with valid @bc.edu emails.</p>
              </div>
            </li>
            <li className="flex items-start">
              <div className="mt-1 mr-3 text-emerald-500 shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="font-bold text-sm sm:text-base">Reliability Scoring</p>
                <p className="text-xs sm:text-sm text-neutral-500">Accountability matters. No-shows affect your future access.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="bg-neutral-50 p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-neutral-100">
          <h3 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 flex items-center">
            <Info size={18} className="mr-2 text-neutral-400 sm:w-5 sm:h-5" /> 
            Safety Guidelines
          </h3>
          <div className="space-y-3 sm:space-y-4">
            {[
              { title: "ID Verification", desc: "Always verify BC IDs before starting the ride." },
              { title: "Public Pickups", desc: "Meet at designated campus spots like Conte Forum." },
              { title: "Share Status", desc: "Let a friend know when you're heading to the airport." }
            ].map((item, i) => (
              <div key={i} className="p-3.5 sm:p-4 bg-white rounded-xl sm:rounded-2xl shadow-sm border border-neutral-100">
                <p className="font-bold text-xs sm:text-sm mb-0.5 sm:mb-1">{item.title}</p>
                <p className="text-[11px] sm:text-xs text-neutral-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Footer CTA */}
      <motion.div 
        className="bg-neutral-900 text-white p-6 sm:p-8 md:p-12 rounded-2xl sm:rounded-[3rem] flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8"
        variants={itemVariants}
      >
        <div className="text-center md:text-left">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-4">Ready to split?</h2>
          <p className="text-neutral-400 text-sm sm:text-base md:text-lg">Join other Eagles who are saving on their way home.</p>
        </div>
        <Link to="/create" className="bg-white text-black px-6 sm:px-10 py-3.5 sm:py-5 rounded-xl sm:rounded-2xl font-bold hover:bg-neutral-200 transition-all whitespace-nowrap text-sm sm:text-base">
          Request a Ride
        </Link>
      </motion.div>

      {/* Legal Disclaimer - Muted and at the bottom */}
      <motion.div className="pt-6 sm:pt-8 border-t border-neutral-100" variants={itemVariants}>
        <div className="flex items-start space-x-3 opacity-40 hover:opacity-100 transition-opacity duration-500">
          <AlertTriangle className="text-neutral-400 shrink-0 mt-0.5" size={14} />
          <div className="text-[10px] text-neutral-500 leading-relaxed tracking-tight">
            <p className="font-bold mb-1">Legal notice & disclaimer</p>
            <p>
              EagleRide is an independent student-led project for the Boston College community. 
              This application is not affiliated with, endorsed by, or officially associated with Boston College. 
              Boston College is not responsible for the operation of this platform, the conduct of its users, or any 
              arrangements made through this service. Users are expected to follow 
              all safety guidelines and university policies.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default About;

