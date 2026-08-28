# 概要

このファイルは、Refinearを安全かつ一貫した方針で開発するためのリポジトリ共通ルールを定める。回答、Issue、commit、Pull Requestは原則として日本語で記述する。

## このアプリケーションについて

### 背景

アカペラやバンドの音取りにはMuseScoreの楽譜が有効だが、`.mscz`ファイルの閲覧やパート練習はPCと専用ソフトに依存しやすい。スマートフォンだけで受け取った楽譜を確認し、特定パートや音符をすぐ聴きたい場面に既存サービスでは十分対応できていない。

### 目的

Refinearは、`.mscz`ファイルの解析、楽譜表示、再生をモバイルブラウザ内で完結させる音取り特化のWebアプリケーションである。

- ユーザーの楽譜をサーバーへ送らず、`webmscore`のWASMを使ってブラウザ内で解析する。
- OSMDで楽譜を描画し、Tone.jsと`osmd-audio-player`で再生する。
- 音符タップ、テンポ変更、パート別音量やミュートなど、反復練習に必要な操作をモバイルで使いやすく提供する。
- PWAとオフライン利用を含め、出先でも短い待ち時間で練習を始められるようにする。

### ターゲット

- アカペラ、合唱、バンドなどでパート練習をする人
- PC版MuseScoreを常用していない、またはスマートフォンだけで楽譜を確認したい人
- 楽譜全体の再生だけでなく、特定の音符やパートを繰り返し確認したい人

## このアプリケーションでやらないこと

- 現行の要件では、アップロードされた`.mscz`や変換後のMusicXMLをサーバーへ送信しない。
- Issueと承認済み計画に含まれないアカウント、クラウド保存、共有、バックエンド機能を先回りして追加しない。
- MuseScoreデスクトップ版の編集機能を完全再現しない。閲覧、再生、音取りを優先する。
- `VITE_`環境変数へ秘密情報を置かない。これらはブラウザへ公開される。
- 古い設計案だけを根拠に、現在の技術スタックへNext.js、Vercel、バックエンドを再導入しない。

## 情報源の優先順位

記述が競合する場合は、次の順で現在の事実を判断する。

1. `package.json`、実装コード、設定ファイル
2. この`AGENTS.md`
3. `README.md`
4. `docs/`配下の設計・企画資料
5. `.github/`配下の古いエージェント指示

`docs/PLAN.md`と`docs/ARCHITECTURE.md`にはNext.jsやVercelを前提とした古い記述が残っている。プロダクト目的、ブラウザ内処理、音声・描画の設計原則は参照するが、フレームワーク、ディレクトリ構成、デプロイ先は現行コードを正とする。

## 現在の技術スタック

- React 19、TypeScript、Vite 8
- Tailwind CSS 4
- Zustand
- `webmscore`、OpenSheetMusicDisplay
- Tone.js、`osmd-audio-player`
- Cloudflare Workers Static Assets
- ESLint、Prettier、npm

## 実装ルール

- `any`は極力使わず、外部データの境界では型検証を行う。
- `default export`は使わず、関数は原則として`const`で宣言する。
- `import.meta.env`の参照は`src/config/featureFlags.ts`へ集約する。
- 正式公開前の機能はFeature Flagで制御し、正式公開時にフラグ定義、環境変数、条件分岐を削除する。
- `.mscz`解析、MusicXML生成、楽譜描画、音声再生の失敗は握りつぶさず、ユーザーが理解できる日本語のエラーを表示する。
- `webmscore`が例外を投げず空または不完全なMusicXMLを返す場合があるため、パート数と小節数を検証してから後続処理へ渡す。詳細は`docs/MSCZ_COMPATIBILITY_INCIDENT_2026-08-07.md`を参照する。
- Web Audio APIの初期化・再開は、ブラウザの制約に従ってユーザー操作の直後に行う。
- UIはモバイルファーストで実装し、タップ領域、スクロール、端末の縦横切替を確認する。
- ユーザーの変更や依頼範囲外の差分を、整形やリファクタリングの名目で変更しない。

## 開発ワークフロー

依頼に応じて、次のスキルを使い分ける。

- リポジトリ内のファイルを変更する機能追加、不具合修正、ドキュメント変更、設定変更: `.agents/skills/develop-feature/SKILL.md`
- Issue作成だけ: `.agents/skills/create-issue/SKILL.md`
- 実装済みの変更についてcommit、push、PR作成だけ: `.agents/skills/create-feature-pr/SKILL.md`
- 質問、調査、レビューだけ: 変更用スキルを使用せず、ユーザーから変更も依頼されていない限りファイルを編集しない

`develop-feature`は一連の変更を統括し、Issue確定では`create-issue`、commit・push・PR作成では`create-feature-pr`を参照する。IssueとPRに関する具体的な手順は各専用スキルを正とし、`AGENTS.md`や`develop-feature`へ重複して記載しない。

リポジトリ内のファイルを編集する前に実装計画を提示し、ユーザーの明示的な承認を得る。承認された範囲だけを変更し、検証がすべて成功してから`create-feature-pr`へ進む。

最低限の検証は次のとおり。

```bash
npm run lint
npm run format:check
npm run build
```

`format:check`が失敗した場合は、今回の作業対象であるファイルだけを`npx prettier --write -- <対象パス>`で整形する。リポジトリ全体を対象とする`npm run format`は実行せず、差分を確認して全検証をやり直す。UI変更では開発サーバーを起動し、実ブラウザで対象操作とコンソールエラーを確認する。

## Git・GitHub操作

### 操作前に必ず確認する

Gitを変更する前に、最低限次を確認する。

```bash
git status --short --branch
git branch --show-current
git remote -v
git worktree list --porcelain
git diff
git diff --cached
```

- 未コミット、stage済み、未追跡の変更はユーザーの所有物として扱う。
- 依頼と無関係な変更をstage、commit、stash、破棄しない。
- 安全に分離できない変更がある場合は、branch切替やcommitの前にユーザーへ確認する。
- `git reset --hard`、`git checkout -- <path>`、無断の`git stash`、force push、履歴書き換えを行わない。

### ブランチとworktree

- baseは最新の`origin/develop`、作業ブランチは`feature/{issue番号}`とする。
- branch作成前に`git fetch origin develop`を実行する。
- 新規branchはupstreamを誤って`origin/develop`へ向けないよう、`git switch -c "feature/{issue番号}" --no-track origin/develop`で作る。
- 同名branchがローカル、origin、別worktreeに存在しないか先に確認する。
- 同名branchが別worktreeでcheckout済みなら、新しいbranchやworktreeを作らず、そのworktreeを使うかユーザーへ確認する。
- 現在のworktreeに無関係な変更がありbranchを切り替えられない場合は、変更を移動せず、専用worktreeを安全な一時ディレクトリへ作る。作成後は作業パス、branch、起点commitを再確認する。

### sandboxの権限エラーで詰まらないためのルール

Codexのsandboxでは、ソースファイルを編集できても`.git`配下への書き込みだけ拒否されることがある。過去に次のエラーが発生している。

```text
fatal: Unable to create '.../.git/index.lock': Operation not permitted
fatal: Unable to create '.../.git/worktrees/.../index.lock': Operation not permitted
```

- `git add`、`git commit`、`git switch`、`git worktree add`、`git fetch`、`git push`など必要な操作がこのエラーで失敗したら、同じ目的のコマンドをsandbox外実行の承認付きで直ちに再実行する。
- 権限エラーを避けるために別のGit実装や手作業で`.git`を書き換えない。
- `Operation not permitted`は古いlockファイルの存在を意味しない。lockファイルを削除しない。
- 実際に`File exists`と表示された場合だけlockの有無と実行中Gitプロセスを読み取り確認し、それでも勝手に削除しない。
- DNS、接続、パッケージ取得、pushがsandbox由来で失敗した場合も、認証エラーと決めつけず、必要に応じて同じコマンドをネットワーク許可付きで再実行する。

### GitHubの認証経路を混同しない

Issue・PRの検索、読み取り、作成はGitHub Appを優先する。GitHub操作を行う前に、確認順序、エラーの判別、`gh`へのフォールバック条件を`docs/GITHUB_AUTHENTICATION.md`で確認する。すべての利用可能な経路で必要な操作が失敗した場合だけ、実エラーと試した経路を示してユーザーへ対応を依頼する。

### Commit、push、Pull Request

stage、commit分割、commit、push、既存PR確認、PR作成は`.agents/skills/create-feature-pr/SKILL.md`を正とする。これらの操作を依頼された場合は同スキルを完全に読み、詳細手順を`AGENTS.md`へ重複して追加しない。
