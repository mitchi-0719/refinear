# リリース手順

Refinearでは、`main`を本番リリース済み、`develop`を次回リリース候補として扱う。通常の機能開発は`feature/{Issue番号}`から`develop`へPull Requestを作成し、リリース時だけ`develop`から`main`へPull Requestを作成する。

## バージョンを決める

GitタグをRefinearの正式なバージョン情報とし、[Semantic Versioning](https://semver.org/lang/ja/)に従って`vX.Y.Z`形式で付与する。

- patch（例: `v0.1.1`）: 後方互換な不具合修正だけ
- minor（例: `v0.2.0`）: 後方互換な機能追加や利用者向けUI改善を含む
- major（例: `v1.0.0`）: 安定版の基準や互換性を変更する

`package.json`はnpm公開を行わないprivateパッケージであるため、リリースバージョンの正本にはしない。

## リリース前に確認する

1. リリース対象のfeature Pull Requestがすべて`develop`へマージされていることを確認する。
2. 未完了の変更を次回へ送る場合は、リリースPRへ明記する。
3. 最新のCloudflare Preview URLで、次を確認する。
   - `.mscz`の読み込みと楽譜表示
   - 再生、シーク、テンポ変更、パート別操作
   - モバイル表示とブラウザコンソール
   - PWAの更新
   - `/lp`、`/privacy`、`/terms`、`/licenses`への直接アクセス
4. `quality`が成功していることを確認する。

## リリースPRを作成する

[リリースPRを作成](https://github.com/mitchi-0719/refinear/compare/main...develop?expand=1&template=release.md)し、次を設定する。

- base: `main`
- compare: `develop`
- タイトル: `release: vX.Y.Z`
- 本文: リリースPRテンプレートの項目を埋める

PRタイトルはタグ自動作成処理の入力になる。形式が一致しないPRではタグとGitHub Releaseを作成しない。

## 自動処理

リリースPRをマージすると、次の処理が開始される。

1. Cloudflare Workers Buildsが`main`をビルドし、`npx wrangler deploy`で本番へデプロイする。
2. GitHub ActionsがPRタイトルからバージョンを取得し、マージコミットへ同名タグを作成する。
3. 同じタグを使ったGitHub Releaseと自動生成リリースノートを作成する。

タグまたはGitHub Releaseが既にある場合、同じコミットとタグの組み合わせなら再作成しない。タグが別のコミットを指している場合は失敗し、既存タグを変更しない。

## Cloudflare Workers Buildsを設定する

Cloudflare DashboardのWorker設定でGitHubリポジトリを接続し、次を設定する。

| 項目 | 値 |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy command | `npx wrangler versions upload` |
| Node.js | `22` |

Non-production branch buildsとPreview URLsを有効にする。featureブランチのPreview URLはCloudflareがPull Requestへ投稿したURLを使用し、Worker名やブランチ名から推測しない。

## 本番を確認する

Cloudflareの本番デプロイ成功後、次を確認する。

1. <https://refinear.39panda.dev/>が表示できる。
2. `/lp`、`/privacy`、`/terms`、`/licenses`へ直接アクセスできる。
3. `.mscz`の読み込み、楽譜表示、再生を確認する。
4. GitHub上でリリースタグがリリースPRのマージコミットを指している。
5. GitHub Releaseが公開されている。

確認後、`main`から`develop`へのPull Requestを作成し、リリース時に作られたマージコミットとリリース結果を同期する。

## ロールバックする

障害がある場合、Cloudflare Dashboardで直前の正常なVersionを確認する。CLIを使う場合は次を実行する。

```bash
npx wrangler versions list
npx wrangler rollback <VERSION_ID> --message "vX.Y.Zの障害対応で直前のVersionへ戻す"
```

ロールバックは本番トラフィックを即時に切り替える。実行後は公開URLを再確認し、対象リリースのGitHub Releaseへ障害とロールバックを記録する。タグを移動・削除して障害を隠さない。

## タグ作成だけが失敗した場合

`Publish release`のログで失敗理由を確認する。同じマージコミットにタグが作成済みでGitHub Releaseだけがない場合は、workflowを再実行すると不足しているReleaseだけを作成する。タグが別コミットにある場合はworkflowを再実行せず、既存タグとリリースPRのマージコミットを確認する。

## 初回リリースを記録する

自動化導入前から公開されている初回リリースは、Cloudflareの現行本番と`origin/main`が同じ内容であることを確認してから`v0.1.0`として記録する。対応を確認できない場合はタグを作成しない。

```bash
git fetch origin main
git tag -a v0.1.0 origin/main -m "v0.1.0 初回リリース"
git push origin v0.1.0
gh release create v0.1.0 --verify-tag --generate-notes --title v0.1.0
```
