import { Link } from 'react-router-dom'

const externalLinkClass =
  'underline decoration-slate-300 underline-offset-4 hover:text-blue-600'

export const Footer = () => (
  <footer className="mt-10 border-t border-slate-200 bg-white px-5 py-8 text-xs leading-5 text-slate-500">
    <div className="mx-auto grid w-full max-w-5xl gap-6 sm:grid-cols-2">
      <div>
        <p className="font-bold text-[#071b47]">Refinear</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <Link className={externalLinkClass} to="/privacy">
            プライバシー
          </Link>
          <Link className={externalLinkClass} to="/terms">
            利用上の注意
          </Link>
          <Link className={externalLinkClass} to="/licenses">
            ライセンス・クレジット
          </Link>
          <a
            className={externalLinkClass}
            href="mailto:refinear.contact@39panda.dev"
          >
            お問い合わせ
          </a>
          <a
            className={externalLinkClass}
            href="https://github.com/mitchi-0719/refinear"
            target="_blank"
            rel="noreferrer"
          >
            GitHubリポジトリ
          </a>
          <a
            className={externalLinkClass}
            href="https://x.com/39Panda_3939"
            target="_blank"
            rel="noreferrer"
          >
            制作者のX
          </a>
        </div>
        <p className="mt-3">© 2026 さくぱん</p>
      </div>

      <div>
        <p className="font-bold text-[#071b47]">
          使用音源・アイコンについて / Credits
        </p>
        <ul className="mt-2 space-y-2">
          <li>ピアノ：Salamander Grand Piano V3（CC BY 3.0）</li>
          <li>ドラム：teropa/drumkit収録音源（CC BY / CC0）</li>
          <li>画面内のアイコン：Google Material Icons（Apache 2.0）ほか</li>
        </ul>
        <p className="mt-3">
          作者、変更内容、各ライセンスの詳細は
          <Link className={externalLinkClass} to="/licenses">
            ライセンス・クレジット
          </Link>
          をご覧ください。
        </p>
      </div>
    </div>
  </footer>
)
