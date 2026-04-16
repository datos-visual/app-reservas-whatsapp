"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Clases cuando la ruta no está activa */
  inactiveClassName?: string;
  /** Clases cuando la ruta coincide (incl. subrutas para href !== "/") */
  activeClassName?: string;
  onClick?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({
  href,
  children,
  className = "",
  inactiveClassName = "",
  activeClassName = "",
  onClick,
}: NavLinkProps) {
  const pathname = usePathname();
  const active = isActive(pathname, href);

  const stateClass = active ? activeClassName : inactiveClassName;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`${className} ${stateClass}`.trim()}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
