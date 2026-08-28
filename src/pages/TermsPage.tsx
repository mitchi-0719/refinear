import {
  LegalPageLayout,
  legalHeadingClass,
  legalLinkClass,
} from '../components/layout/LegalPageLayout'

export const TermsPage = () => (
  <LegalPageLayout
    title="利用上の注意"
    description="Refinearを安心して利用していただくための注意事項です。"
  >
    <h2 className={legalHeadingClass}>サービスについて</h2>
    <p className="mt-3">
      Refinearは、MSCZ形式の楽譜をブラウザ上で表示・再生する無料のアプリケーションです。独立して開発された非公式アプリケーションであり、MuseScore
      Limitedとの提携、承認、後援関係はありません。
    </p>

    <h2 className={legalHeadingClass}>利用できる楽譜</h2>
    <p className="mt-3">
      利用者自身が作成した楽譜、適法に入手した楽譜、その他利用権限を持つ楽譜のみを使用してください。著作権など第三者の権利を侵害する目的や、法令に違反する目的で本サービスを利用しないでください。
    </p>

    <h2 className={legalHeadingClass}>バックアップ</h2>
    <p className="mt-3">
      端末内に保存される履歴は、楽譜のバックアップを目的としたものではありません。元のMSCZファイルを含む重要なデータは、利用者自身で保管してください。
    </p>

    <h2 className={legalHeadingClass}>保証と責任</h2>
    <p className="mt-3">
      本サービスは現状有姿で提供します。すべてのMSCZファイルへの対応、楽譜表示や変換・再生の正確性、継続的な提供、特定の目的への適合性を保証しません。法令上認められる範囲で、本サービスの利用または利用不能によって生じた損害について責任を負いません。
    </p>

    <h2 className={legalHeadingClass}>変更・停止</h2>
    <p className="mt-3">
      改善、保守、セキュリティ対応などのため、予告なく機能を変更し、または提供を一時停止・終了することがあります。
    </p>

    <h2 className={legalHeadingClass}>オープンソースライセンス</h2>
    <p className="mt-3">
      Refinearのソースコードとデモ楽譜はGNU General Public License version
      3の条件で利用できます。第三者のソフトウェアと素材には、それぞれのライセンスが適用されます。詳細は
      <a className={legalLinkClass} href="/licenses">
        ライセンス・クレジット
      </a>
      をご覧ください。
    </p>

    <h2 className={legalHeadingClass}>準拠法</h2>
    <p className="mt-3">本注意事項は日本法に準拠します。</p>

    <h2 className={legalHeadingClass}>お問い合わせ</h2>
    <p className="mt-3">
      不具合や権利侵害に関するご連絡は
      <a className={legalLinkClass} href="mailto:refinear.contact@39panda.dev">
        refinear.contact@39panda.dev
      </a>
      までお願いします。
    </p>
  </LegalPageLayout>
)
