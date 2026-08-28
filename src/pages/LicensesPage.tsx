import {
  LegalPageLayout,
  legalHeadingClass,
  legalLinkClass,
} from '../components/layout/LegalPageLayout'

const ExternalLink = ({
  href,
  children,
}: {
  href: string
  children: string
}) => (
  <a className={legalLinkClass} href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
)

export const LicensesPage = () => (
  <LegalPageLayout
    title="ライセンス・クレジット"
    description="Refinearと、アプリ内で利用しているソフトウェア・素材の権利表示です。"
  >
    <h2 className={legalHeadingClass}>Refinear</h2>
    <p className="mt-3">
      Copyright © 2026 さくぱん
      <br />
      Refinearのソースコードと同梱するデモ楽譜は、
      <ExternalLink href="https://www.gnu.org/licenses/gpl-3.0.html">
        GNU General Public License version 3 only
      </ExternalLink>
      の条件で公開しています。本ソフトウェアは無保証です。ソースコードとライセンス全文は
      <ExternalLink href="https://github.com/mitchi-0719/refinear">
        GitHubリポジトリ
      </ExternalLink>
      から確認できます。
    </p>

    <h2 className={legalHeadingClass}>ピアノ音源</h2>
    <p className="mt-3">
      <ExternalLink href="https://github.com/Tonejs/audio/tree/master/salamander">
        Salamander Grand Piano V3
      </ExternalLink>{' '}
      by Alexander Holm —
      <ExternalLink href="https://creativecommons.org/licenses/by/3.0/">
        Creative Commons Attribution 3.0
      </ExternalLink>
    </p>
    <p className="mt-2">
      Refinearでは、配布音源から必要な音を選択し、アプリでの利用に合わせてMP3形式への変換とファイル名の変更を行っています。
    </p>

    <h2 className={legalHeadingClass}>ドラム音源</h2>
    <p className="mt-3">
      <ExternalLink href="https://github.com/teropa/drumkit">
        teropa/drumkit
      </ExternalLink>
      に収録された、Freesound由来の次のサンプルを利用しています。
    </p>
    <ul className="mt-3 list-disc space-y-2 pl-6">
      <li>DWDS's Deep House Drum Kit — Creative Commons Attribution</li>
      <li>
        Stomachache's Analog Cymbal —
        <ExternalLink href="https://creativecommons.org/publicdomain/zero/1.0/">
          CC0 1.0
        </ExternalLink>
      </li>
      <li>
        Karman Lyne's 808 toms —
        <ExternalLink href="https://creativecommons.org/publicdomain/zero/1.0/">
          CC0 1.0
        </ExternalLink>
      </li>
    </ul>
    <p className="mt-3">
      Refinearでは、必要な音の選択、音声形式の変換、ファイル名の変更を行っています。teropa/drumkitのコード部分はMIT
      Licenseです。
    </p>

    <h2 className={legalHeadingClass}>アイコン</h2>
    <p className="mt-3">
      一部のアイコンは
      <ExternalLink href="https://github.com/google/material-design-icons">
        Google Material Icons
      </ExternalLink>
      をコード内へ組み込んで使用しています（
      <ExternalLink href="https://www.apache.org/licenses/LICENSE-2.0">
        Apache License 2.0
      </ExternalLink>
      ）。メトロノームアイコンなど、その他のアイコンはRefinearのために作成したものです。
    </p>

    <h2 className={legalHeadingClass}>主なオープンソースソフトウェア</h2>
    <ul className="mt-3 list-disc space-y-2 pl-6">
      <li>
        <ExternalLink href="https://github.com/LibreScore/webmscore">
          webmscore
        </ExternalLink>{' '}
        — GNU GPL v3
      </li>
      <li>
        <ExternalLink href="https://github.com/opensheetmusicdisplay/opensheetmusicdisplay">
          OpenSheetMusicDisplay
        </ExternalLink>{' '}
        — BSD 3-Clause License
      </li>
      <li>
        <ExternalLink href="https://github.com/jimutt/osmd-audio-player">
          osmd-audio-player
        </ExternalLink>{' '}
        — MIT License
      </li>
      <li>
        <ExternalLink href="https://github.com/Tonejs/Tone.js">
          Tone.js
        </ExternalLink>{' '}
        — MIT License
      </li>
      <li>
        <ExternalLink href="https://github.com/Stuk/jszip">JSZip</ExternalLink>{' '}
        — MIT License
      </li>
      <li>
        <ExternalLink href="https://github.com/facebook/react">
          React
        </ExternalLink>{' '}
        — MIT License
      </li>
      <li>
        <ExternalLink href="https://github.com/remix-run/react-router">
          React Router
        </ExternalLink>{' '}
        — MIT License
      </li>
      <li>
        <ExternalLink href="https://github.com/pmndrs/zustand">
          Zustand
        </ExternalLink>{' '}
        — MIT License
      </li>
    </ul>
    <p className="mt-4">
      各ソフトウェアの完全なライセンス情報は、ソースコードに含まれる依存関係の配布物と
      <ExternalLink href="https://github.com/mitchi-0719/refinear/blob/develop/THIRD_PARTY_NOTICES.md">
        THIRD_PARTY_NOTICES.md
      </ExternalLink>
      と、公開ビルドに含まれるライセンス本文を収録した
      <ExternalLink href="/third-party-licenses.txt">
        third-party-licenses.txt
      </ExternalLink>
      でも確認できます。
    </p>
  </LegalPageLayout>
)
