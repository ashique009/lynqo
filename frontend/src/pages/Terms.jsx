import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  FileText,
  ArrowLeft,
  Sun,
  Moon,
  Mail,
  ShieldCheck,
  UserCheck,
  Slash,
  AlertTriangle,
  Ban,
  Scale,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';

export const Terms = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const sections = [
    {
      id: 1,
      title: '1. Eligibility',
      icon: UserCheck,
      content:
        'You must be 18 years of age or older to use Lynqo. By using this app, you confirm that you meet this requirement.',
    },
    {
      id: 2,
      title: '2. User Accounts',
      icon: ShieldCheck,
      items: [
        'You are responsible for keeping your account secure.',
        'You must provide accurate information.',
        'You must not create fake or misleading accounts.',
      ],
    },
    {
      id: 3,
      title: '3. Acceptable Use',
      icon: Ban,
      lead: 'While using Lynqo, you agree not to:',
      items: [
        'Harass, threaten, or abuse other users.',
        'Share illegal, harmful, or offensive content.',
        'Post sexually explicit content.',
        'Impersonate another person.',
        'Spam users or send unwanted promotional messages.',
        'Attempt to hack, damage, or interfere with the platform.',
      ],
    },
    {
      id: 4,
      title: '4. User Content',
      icon: FileText,
      content:
        'You are responsible for the content you post or send through Lynqo. You must ensure that your content does not violate any applicable laws or the rights of others.',
    },
    {
      id: 5,
      title: '5. Account Suspension',
      icon: AlertTriangle,
      content:
        'Lynqo reserves the right to suspend or permanently remove any account that violates these Terms and Conditions without prior notice.',
    },
    {
      id: 6,
      title: '6. Privacy',
      icon: ShieldCheck,
      content: (
        <span>
          Your use of Lynqo is also governed by our{' '}
          <Link
            to="/privacy-policy"
            className="text-[#D4537E] dark:text-brand-purple-light underline hover:opacity-80 transition-opacity font-semibold"
          >
            Privacy Policy
          </Link>
          .
        </span>
      ),
    },
    {
      id: 7,
      title: '7. Limitation of Liability',
      icon: Scale,
      content:
        'Lynqo is provided on an "as is" basis. While we strive to provide a reliable service, we cannot guarantee uninterrupted or error-free operation.',
    },
    {
      id: 8,
      title: '8. Changes to These Terms',
      icon: RefreshCw,
      content:
        'We may update these Terms and Conditions from time to time. Continued use of Lynqo after changes are published means you accept the updated Terms.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FCEEF3] dark:bg-brand-black text-[#2C2C2A] dark:text-slate-100 flex flex-col justify-between transition-colors duration-200 relative overflow-x-hidden select-none">
      {/* Background ambient glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#F0997B]/10 dark:bg-brand-purple-light/5 blur-[120px] pointer-events-none z-0" />

      {/* Header Bar */}
      <header className="sticky top-0 z-30 w-full glass-panel border-b border-[#F4C0D1] dark:border-brand-purple/10 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-xs bg-white/80 dark:bg-brand-black/40 backdrop-blur-md">
        <button
          onClick={handleGoBack}
          className="flex items-center gap-2 text-xs font-bold text-[#5F5E5A] hover:text-[#D4537E] dark:text-slate-400 dark:hover:text-brand-purple-light px-3 py-1.5 rounded-xl hover:bg-[#F4C0D1]/30 dark:hover:bg-brand-purple/15 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <Link to="/" className="flex items-center gap-2 select-none">
          <span className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[#D4537E] via-[#F0997B] to-[#D4537E] dark:from-purple-400 dark:via-indigo-300 dark:to-brand-purple-light bg-clip-text text-transparent font-display">
            Lynqo
          </span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl text-[#5F5E5A] dark:text-slate-400 hover:text-[#D4537E] dark:hover:text-brand-purple-light bg-[#FCEEF3] dark:bg-brand-dark/40 hover:bg-[#F4C0D1]/40 dark:hover:bg-brand-purple/20 border border-[#F4C0D1] dark:border-brand-purple/20 transition-all duration-200 cursor-pointer flex items-center justify-center"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-[#D4537E]" />
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow py-8 px-4 md:px-8 max-w-4xl mx-auto w-full relative z-10 space-y-8">
        {/* Page Hero Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/15 border border-[#D4537E]/20 dark:border-brand-purple/30 text-[#D4537E] dark:text-brand-purple-light text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>Terms of Service</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold font-display text-[#2C2C2A] dark:text-slate-100 tracking-tight">
            Terms and Conditions
          </h1>

          <div className="text-xs md:text-sm font-semibold text-[#5F5E5A] dark:text-slate-400 flex items-center justify-center gap-2">
            <span>Terms and Conditions for Lynqo</span>
            <span className="w-1 h-1 rounded-full bg-[#D4537E] dark:bg-brand-purple-light"></span>
            <span>Last Updated: July 25, 2026</span>
          </div>
        </div>

        {/* Content Container */}
        <div className="glass-panel p-6 md:p-10 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/15 bg-white dark:bg-brand-dark/20 space-y-8 shadow-xl">
          {/* Welcome Message */}
          <div className="p-4 md:p-5 rounded-2xl bg-[#FCEEF3]/70 dark:bg-brand-purple/10 border border-[#F4C0D1] dark:border-brand-purple/20 text-sm text-[#2C2C2A] dark:text-slate-200 font-medium leading-relaxed">
            Welcome to Lynqo. By creating an account or using our services, you agree to these Terms and Conditions.
          </div>

          {sections.map((sec) => {
            const IconComponent = sec.icon;
            return (
              <div key={sec.id} className="space-y-3 text-left">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#D4537E]/10 dark:bg-brand-purple/15 border border-[#D4537E]/20 dark:border-brand-purple/20 text-[#D4537E] dark:text-brand-purple-light flex-shrink-0">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg md:text-xl font-bold font-display text-[#2C2C2A] dark:text-slate-100">
                    {sec.title}
                  </h2>
                </div>

                {sec.lead && (
                  <p className="pl-4 md:pl-10 text-sm font-semibold text-[#2C2C2A] dark:text-slate-200">
                    {sec.lead}
                  </p>
                )}

                {sec.items ? (
                  <ul className="pl-4 md:pl-10 space-y-2 text-sm text-[#5F5E5A] dark:text-slate-300">
                    {sec.items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4537E] dark:bg-brand-purple-light mt-2 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pl-4 md:pl-10 text-sm text-[#5F5E5A] dark:text-slate-300 leading-relaxed">
                    {sec.content}
                  </div>
                )}
              </div>
            );
          })}

          {/* Section 9: Contact Us */}
          <div className="pt-4 border-t border-[#F4C0D1]/60 dark:border-slate-800 space-y-3 text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#D4537E]/10 dark:bg-brand-purple/15 border border-[#D4537E]/20 dark:border-brand-purple/20 text-[#D4537E] dark:text-brand-purple-light flex-shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <h2 className="text-lg md:text-xl font-bold font-display text-[#2C2C2A] dark:text-slate-100">
                9. Contact Us
              </h2>
            </div>

            <div className="pl-4 md:pl-10">
              <div className="p-4 rounded-2xl bg-[#FCEEF3]/60 dark:bg-brand-black/40 border border-[#F4C0D1] dark:border-brand-purple/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                  <div>
                    <p className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">
                      If you have any questions regarding these Terms and Conditions, please contact us at:
                    </p>
                    <a
                      href="mailto:lynqoadmin111@gmail.com"
                      className="text-sm font-bold text-[#D4537E] hover:underline dark:text-brand-purple-light transition-colors mt-1 inline-block"
                    >
                      lynqoadmin111@gmail.com
                    </a>
                  </div>
                  <Link
                    to="/contact-us"
                    className="text-xs font-bold bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 flex-shrink-0"
                  >
                    Contact Support Form
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="py-6 text-center text-xs text-[#5F5E5A] dark:text-slate-500 font-medium relative z-10 border-t border-[#F4C0D1]/50 dark:border-slate-900 mt-6">
        <p>© 2026 Lynqo. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Terms;
