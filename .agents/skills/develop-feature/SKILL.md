---
name: develop-feature
description: Refinearの機能追加、不具合修正、ドキュメント変更、設定変更について、既存Issueの確認または起票から、develop起点のブランチ作成、承認前の実装計画、変更、検証、commit、push、PR作成、Cloudflareプレビュー確認までを一貫して行う。質問への回答、調査のみ、レビューのみの依頼には使用しない。
---

# Develop Feature

Refinearの修正をIssueと対応付け、ユーザーが承認した計画だけを実装し、検証済みのPRと利用可能なCloudflareプレビューURLを返す。

## 実行上の不変条件

- 次のフェーズを順番に進める。計画の明示的な承認を得るまでは、Issue操作とブランチ作成を除き、コード、ドキュメント、設定、テストなどリポジトリ内のファイルを一切編集しない。
- ユーザーの肯定を推測しない。計画を提示したターンを終了し、「承認」「この計画で進めて」などの明示的な回答を待つ。修正要望が返った場合は計画だけを更新し、再承認を待つ。
- 作業ツリーにユーザーの変更がある場合は保持する。対象作業と安全に分離できないときは、checkout、stage、commitをせずユーザーに確認する。
- GitHub操作の前に`docs/GITHUB_AUTHENTICATION.md`を読み、GitHub Appを優先し、定義された条件を満たす場合だけ`gh`へフォールバックする。認証やネットワークの失敗を推測せず、実リクエストの結果で判断する。
- 破壊的なGit操作、既存履歴の書き換え、既存ブランチの作り直しは行わない。

## 1. Issueを確定する

Issueの重複検索、原稿作成、既存Issueの再利用、起票は`../create-issue/SKILL.md`を完全に読み、Issue確定フェーズに適用する。このスキルにはIssue作成の詳細手順を重複して定義しない。

`create-issue`の完了後は本スキルへ戻り、採用したIssueの番号、タイトル、URLを保持して次のフェーズへ進む。Issueを確定できなかった場合は、ブランチ作成やファイル編集へ進まず、同スキルが定める失敗内容をユーザーへ報告する。

## 2. 最新のdevelopからブランチを作る

1. `git status --short --branch`、`git remote -v`、現在のブランチを確認する。
2. `origin`から`develop`をfetchする。
3. 現在のbranchが既に`feature/{issue番号}`なら、Issue、起点、履歴、作業ツリーを確認し、安全に継続できる場合はそのまま使用する。
4. 現在のbranchとは別に`feature/{issue番号}`がローカル、origin、または別worktreeに存在する場合は作り直さず、履歴、PR、作業ツリーを調べ、安全な継続方法をユーザーに確認する。
5. 存在しない場合は、最新の`origin/develop`を起点に`git switch -c "feature/{issue番号}" --no-track origin/develop`で作成してcheckoutする。
6. ブランチ名と起点を確認する。この時点でもファイルは編集しない。

## 3. 実装計画を作り、承認を待つ

Issue、関連ドキュメント、対象コード、既存テストを読み取り専用で調査する。不明点が実装結果を左右する場合は、計画を確定する前にユーザーへ質問する。

計画には次を含める。

- 解決する問題と完了条件
- 変更・追加するファイルと、それぞれの修正内容
- 重要な処理は関数またはコンポーネント単位の実装手順
- 追加・更新するテストと、手動確認が必要な操作
- 想定される影響範囲、互換性、リスク
- 実行する検証コマンド

計画をチャット上で提示し、明示的な承認を求めてターンを終了する。計画を保存するためのファイル作成や編集はしない。

## 4. 承認済みの計画を実装する

承認を受けたら、現在のブランチが厳密に`feature/{issue番号}`であることを再確認し、承認された範囲だけを実装する。実装中に計画を実質的に変える要件や選択が判明した場合は編集を止め、差分と選択肢を説明して再承認を得る。小さな実装上の調整は自律的に進める。

既存の規約と設計に従い、変更に対応するテストを追加または更新する。UI変更ではローカルアプリを起動し、対象操作、主要な表示状態、ブラウザコンソールエラーを実ブラウザで確認する。

## 5. 検証する

少なくとも次を実行する。

```bash
npm run lint
npm run format:check
npm run build
```

`format:check`が失敗した場合は、今回の作業対象であるファイルだけを`npx prettier --write -- <対象パス>`で整形する。リポジトリ全体を対象とする`npm run format`は実行しない。変更内容を確認してから3コマンドをすべて再実行する。リポジトリに変更範囲へ適用できるテストがあれば、それも実行する。失敗を未解決のままcommit、push、PR作成へ進めない。

UI変更では自動検証に加えてブラウザ確認を必須とし、確認した操作と結果を記録する。実行できない確認がある場合は理由をユーザーに伝え、次へ進む承認を得る。

## 6. Commit、push、PRを作成する

検証がすべて成功したら、commitの分割、stage、commit、push、既存PR確認、PR作成は`../create-feature-pr/SKILL.md`を完全に読み、公開フェーズに適用する。このスキルには公開処理の詳細手順を重複して定義しない。

`create-feature-pr`へ確定済みのIssue番号と作業概要を渡す。完了後は本スキルへ戻り、返されたPRのタイトルとURLを保持してCloudflareプレビュー確認へ進む。commit、push、またはPR作成が完了しなかった場合は成功扱いにせず、Cloudflare確認へ進まない。

## 7. CloudflareプレビューURLを取得する

このリポジトリはCloudflare Workers BuildsのGit連携を前提とする。非本番ブランチビルドが有効で、preview deployが`wrangler versions upload`を実行し、Preview URLsが有効なら、featureブランチへのpushからプレビューバージョンが生成される。PRに紐づくcommitでは、Cloudflareがビルド状態とPreview URLをPRコメントへ投稿する。

PR作成後、Cloudflareのcheck、PRコメント、GitHub deploymentを確認する。ビルドが進行中なら、ユーザーを60秒以上更新なしで待たせず、10分を上限に状態を追う。Cloudflareが実際に提示した`workers.dev`のPreview URLだけを採用し、ブランチ名やWorker名からURLを推測しない。URLを開ける場合は応答も確認する。

上限までにURLを取得できなければ、次を確認して結果を報告する。

- Cloudflare Workers Buildsが対象リポジトリに接続されているか
- non-production branch buildsが有効か
- preview deploy commandが`wrangler versions upload`か
- Preview URLsが有効か
- 対象commitのbuild/checkがpending、失敗、または未作成か

未取得を成功扱いにせず、「pending」「build失敗」「設定未確認」「Preview URLなし」など判明した状態と、確認場所を返す。

## 8. 完了報告する

次を簡潔に返す。

- 実装した内容
- 実行した自動検証とブラウザ確認の結果
- Issueのタイトルとクリック可能なURL
- PRのタイトルとクリック可能なURL
- `feature/{issue番号}`に紐づくCloudflare Preview URL、または取得できなかった具体的な状態
- 残っている未コミットのユーザー変更や既知の制約
