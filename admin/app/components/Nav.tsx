'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const TABS: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/episodes/new', label: 'New Episode' },
  { href: '/episodes', label: 'Episodes' },
  { href: '/blog', label: 'Blog' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/social', label: 'Social' },
  { href: '/settings', label: 'Settings' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">MISFIT ADMIN</div>
        <button
          onClick={signOut}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#5f5f5f',
            fontSize: 12.5,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Sign out
        </button>
      </div>

      <div className="nav">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={pathname === tab.href ? 'active' : ''}>
            {tab.label}
          </Link>
        ))}
      </div>
    </>
  );
}
