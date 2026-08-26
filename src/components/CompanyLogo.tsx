import React, { useState } from 'react';
import { COMPANY_DOMAINS } from '../lib/companyLogos';

interface CompanyLogoProps {
  symbol: string;
  name: string;
  size?: number;
  className?: string;
}

/** Company logo via Clearbit's free logo API, falling back to an initial-letter badge when unmapped or unavailable. */
export const CompanyLogo: React.FC<CompanyLogoProps> = ({ symbol, name, size = 28, className = '' }) => {
  const domain = COMPANY_DOMAINS[symbol];
  const [failed, setFailed] = useState(false);

  if (!domain || failed) {
    const initial = name.trim().charAt(0).toUpperCase() || '?';
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-slate-200 text-slate-600 font-black shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`}
      alt=""
      onError={() => setFailed(true)}
      className={`rounded-full object-contain bg-white border border-slate-100 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
