# Refinear（リファイナー）

Refinear は、MuseScore の `.mscz` ファイルをブラウザ上で読み込み、**解析・楽譜表示・再生**までをフロントエンドのみで完結させる音取りアプリです。

名前は「洗練する」を意味する **Refine** と、「聴く」を意味する **Hear** を組み合わせた造語です。楽譜を見て、音を聴き、繰り返し確かめる。その積み重ねによって、一つひとつの音や自分のパートを磨いていく——そんな音取りの過程を表現しています。

> 聴くたびに、音が磨かれていく。

## 概要

- バックエンドを使わず、ブラウザ内で `.mscz` を処理
- 楽譜を SVG 描画して表示
- 音符タップ時の発音・再生/停止などの基本操作に対応
- `public/demo.mscz` を使ったデモ読み込みに対応

## 使用技術

- **フレームワーク / ビルド**: React 19, TypeScript, Vite
- **状態管理**: Zustand
- **楽譜解析**: webmscore（WASM）
- **楽譜描画**: OpenSheetMusicDisplay (OSMD)
- **再生**: Tone.js, osmd-audio-player
- **スタイリング**: Tailwind CSS
- **Lint / Format**: ESLint, Prettier

## アーキテクチャ

主な責務は以下のように分離しています。

- `src/components/`
  - `FileUploader`: `.mscz` ファイルの入力・バリデーション・デモ読み込み
  - `ScorePreview`: 楽譜表示、再生フック接続、音符クリック操作
  - `ControlModal`: 再生/停止 UI
- `src/hooks/`
  - `useOSMD`: OSMD インスタンス生成と描画
  - `useAudioPlayer`: サンプラー初期化、再生ループ、ノートトリガー
  - `useNoteInteraction`: クリック位置と楽譜ノートの対応付け
- `src/lib/`
  - `msczConverter`: `webmscore` で `.mscz` を MusicXML / MXL へ変換
  - `musicXmlParser`: MusicXML から再生イベント列を抽出
- `src/stores/useScoreStore.ts`
  - ファイル状態、変換結果、再生状態を一元管理

## 仕組み（処理フロー）

1. ユーザーが `.mscz` をアップロード（またはデモファイルを読み込み）
2. `webmscore` で MusicXML（必要に応じて MXL）へ変換
3. `useOSMD` が MusicXML を読み込み、楽譜を描画
4. `musicXmlParser` が MusicXML をノートイベントへ変換
5. `useAudioPlayer` が Tone.js でイベントを再生
6. `useNoteInteraction` がクリックされた音符を判定して単音再生

## セットアップ（初めての方向け）

### 1. 前提

- Node.js
- npm

### 2. インストール

```bash
npm ci
```

### 3. 開発サーバー起動

```bash
npm run dev
```

起動後、表示された URL（通常 `http://localhost:5173`）を開いてください。

production用の環境変数で開発サーバーを起動する場合は、次を実行します。

```bash
npm run dev:production
```

これはproduction用の環境変数やFeature Flagをローカルで確認するためのコマンドです。本番ビルドそのものを確認するときは、`npm run build`の後に`npm run preview`を実行してください。

### 4. Feature Flag

公開前の機能は `src/config/featureFlags.ts` で管理します。`VITE_FEATURE_*` 環境変数は、値が文字列の `true` の場合だけ有効になり、未設定を含むそれ以外の値では無効になります。

開発環境で有効にするフラグは `.env.development` に記載します。productionではデフォルトで無効になるため、無効化用の環境変数を設定する必要はありません。機能を正式公開するときは、環境変数、`featureFlags` の項目、利用箇所の条件分岐を削除します。

`VITE_` で始まる環境変数はブラウザへ公開されるため、秘密情報には使用しないでください。

### 5. 動作確認

1. 画面の「デモ楽譜を読み込み」をクリック  
   または `.mscz` ファイルをドラッグ&ドロップ
2. 楽譜が表示されることを確認
3. 再生ボタンで音が出ることを確認

## 開発用コマンド

```bash
# Lint
npm run lint

# Build
npm run build

# Format
npm run format

# Build済み成果物のプレビュー
npm run preview
```

## Cloudflare Workers

このアプリは Cloudflare Workers Static Assets へデプロイします。設定は `wrangler.jsonc` で管理します。

- ビルドコマンド: `npm run build`
- ビルド出力ディレクトリ: `dist`
- Node.js バージョン: `22`

`assets.not_found_handling` を `single-page-application` に設定しているため、`/lp` などの URL へ直接アクセスしても React Router のページが表示されます。

```bash
# Cloudflare と同じ配信方式でローカル確認
npm run preview:cloudflare

# 本番デプロイ
npm run deploy:cloudflare
```

Pull RequestのCI、Cloudflare Workers Builds、リリースPR、Gitタグ、GitHub
Release、ロールバックを含む運用手順は
[`docs/RELEASE.md`](./docs/RELEASE.md)を参照してください。

## ライセンス

Refinearのソースコードと同梱するデモ楽譜は、GNU General Public License
version 3 only（GPL-3.0-only）の条件で公開しています。ライセンス全文は
[`LICENSE`](./LICENSE)を参照してください。

音源、アイコン、依存ソフトウェアにはそれぞれのライセンスが適用されます。
詳細は[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)と、公開アプリの
「ライセンス・クレジット」を参照してください。

## 公開情報

- 公開URL: <https://refinear.39panda.dev/>
- プライバシー: <https://refinear.39panda.dev/privacy>
- 利用上の注意: <https://refinear.39panda.dev/terms>
- ライセンス・クレジット: <https://refinear.39panda.dev/licenses>
- 問い合わせ: <refinear.contact@39panda.dev>
