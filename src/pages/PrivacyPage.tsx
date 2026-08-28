import {
  LegalPageLayout,
  legalHeadingClass,
  legalLinkClass,
} from '../components/layout/LegalPageLayout'

export const PrivacyPage = () => (
  <LegalPageLayout
    title="プライバシー"
    description="Refinearで取り扱う情報と、その保存場所について説明します。"
  >
    <h2 className={legalHeadingClass}>楽譜データの取扱い</h2>
    <p className="mt-3">
      選択したMSCZファイルの読み込み、変換、表示、再生はブラウザ内で行います。現在のRefinearは、楽譜ファイルや演奏履歴を運営者のサーバーへ送信しません。
    </p>

    <h2 className={legalHeadingClass}>端末内に保存する情報</h2>
    <p className="mt-3">
      最近開いた楽譜を再度利用できるよう、ブラウザのIndexedDBに変換後の楽譜データ、ファイル名、ファイルサイズ、ファイルの更新日時、利用日時を最大5件保存します。また、ホーム画面への追加案内を表示済みかどうかをlocalStorageに保存します。
    </p>
    <p className="mt-3">
      最近開いた楽譜はアプリ画面から個別に削除できます。すべて削除する場合は、ブラウザの設定からRefinearのサイトデータを削除してください。ブラウザのデータ消去や端末の変更によって、保存情報が失われることがあります。
    </p>

    <h2 className={legalHeadingClass}>サイト配信時に処理される情報</h2>
    <p className="mt-3">
      本サービスはCloudflareを利用して配信しています。サイトの配信、セキュリティ確保、不正利用防止のため、CloudflareがIPアドレス、ブラウザ情報、アクセス日時などを処理する場合があります。取扱いの詳細は
      <a
        className={legalLinkClass}
        href="https://www.cloudflare.com/privacypolicy/"
        target="_blank"
        rel="noreferrer"
      >
        Cloudflareのプライバシーポリシー
      </a>
      をご確認ください。
    </p>

    <h2 className={legalHeadingClass}>アクセス解析・広告</h2>
    <p className="mt-3">
      現在、独自のアクセス解析、広告配信、外部のエラー監視サービスは利用していません。これらを導入する場合や、楽譜をサーバーで処理する機能を追加する場合は、事前に本ページを更新し、必要な案内と選択手段を設けます。
    </p>

    <h2 className={legalHeadingClass}>お問い合わせ</h2>
    <p className="mt-3">
      メールでお問い合わせいただいた場合、送信者のメールアドレスと本文を問い合わせ対応のために利用します。法令上必要な場合を除き、別の目的には利用しません。
    </p>
    <p className="mt-3">
      連絡先：
      <a className={legalLinkClass} href="mailto:refinear.contact@39panda.dev">
        refinear.contact@39panda.dev
      </a>
    </p>

    <h2 className={legalHeadingClass}>内容の変更</h2>
    <p className="mt-3">
      機能や法令の変更に応じて、この内容を更新することがあります。重要な変更は本サービス上で分かりやすくお知らせします。
    </p>
  </LegalPageLayout>
)
