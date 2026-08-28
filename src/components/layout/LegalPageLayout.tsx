import type { ReactNode } from 'react'

import { Link } from 'react-router-dom'

type LegalPageLayoutProps = {
  children: ReactNode
  description: string
  title: string
}

export const legalHeadingClass = 'mt-10 text-xl font-bold text-[#071b47]'
export const legalLinkClass =
  'text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900'

export const LegalPageLayout = ({
  children,
  description,
  title,
}: LegalPageLayoutProps) => (
  <div className="min-h-screen bg-slate-50 text-slate-700">
    <header className="border-b border-slate-200 bg-white px-5 py-4">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
        <Link className="text-lg font-extrabold text-[#071b47]" to="/lp">
          Refinear
        </Link>
        <Link className={legalLinkClass} to="/">
          アプリを開く
        </Link>
      </div>
    </header>
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <p className="text-xs font-bold tracking-[0.14em] text-blue-600">
        REFINEAR
      </p>
      <h1 className="mt-2 text-3xl font-bold text-[#071b47] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 leading-7 text-slate-600">{description}</p>
      <div className="mt-10 leading-7">{children}</div>
      <p className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
        制定日：2026年8月17日
      </p>
    </main>
  </div>
)
