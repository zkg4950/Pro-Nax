/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { Link, useLocation } from '@tanstack/react-router';
import { Home, PlusSquare, PlaySquare, User, Compass } from 'lucide-react';

export function MobileNav() {
  const location = useLocation();

  const navItems = [
    { icon: Home, label: 'Home', to: '/' },
    { icon: PlaySquare, label: 'Shorts', to: '/shorts' },
    { icon: PlusSquare, label: 'Upload', to: '/upload' },
    { icon: Compass, label: 'Explore', to: '/explore' },
    { icon: User, label: 'Profile', to: '/profile' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-14 md:hidden flex justify-around items-center bg-black border-t border-zinc-800/80 z-50 px-1 pb-safe"
      style={{ perspective: '600px' }}
    >

      {navItems.map(({ icon: Icon, label, to }) => {
        const isActive = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`group flex flex-col items-center justify-center gap-0.5 py-1 min-w-[52px] transition-all duration-200 active:scale-95 ${
              isActive ? 'text-cyan-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span
              className={`relative grid place-items-center rounded-xl transition-transform duration-200 ${
                isActive
                  ? 'bg-cyan-400/10 shadow-[0_4px_10px_-4px_rgba(34,211,238,0.8),inset_0_1px_0_rgba(255,255,255,0.15)] -translate-y-0.5'
                  : 'shadow-[0_2px_4px_-3px_rgba(0,0,0,0.9)]'
              } px-2.5 py-1 group-active:translate-y-[1px]`}
              style={{ transform: isActive ? 'rotateX(12deg)' : undefined }}
            >
              <Icon className="w-[22px] h-[22px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]" />
            </span>
            <span className="text-[10px] leading-none font-semibold">{label}</span>
          </Link>
        );
      })}

    </nav>
  );
}