---
name: create-feature-pr
description: 未コミット変更を必要に応じて論理的な複数commitに分け、feature/{issue番号} ブランチを origin にpushし、develop向けGitHub Pull Requestを作成する。変更のcommitからPR作成まで、featureブランチの公開、develop向けレビュー依頼、または「issue番号と作業概要からPRを作って」と依頼されたときに使用する。PRタイトルは必ず「refs #{issue番号} {作業概要}」にする。
---

# Create Feature PR

変更を適切な単位でcommitし、`feature/{issue番号}` を安全に公開して、`develop` 向けPRのURLを返す。

## 入力を確定する

1. issue番号と作業概要をユーザーの依頼から取得する。
2. issue番号が省略されている場合、現在のブランチ名が厳密に `feature/<数字>` なら、その数字を使用する。
3. 作業概要が省略されている場合、事前確認で取得する最新の`origin/develop...HEAD`のコミットと差分から短い日本語の概要を作る。
4. issue番号または作業概要を安全に確定できない場合だけ、ユーザーに確認する。
5. 次の値を組み立てる。
   - headブランチ: `feature/{issue番号}`
   - baseブランチ: `develop`
   - PRタイトル: `refs #{issue番号} {作業概要}`

## 事前確認する

以下を読み取り専用コマンドで確認する。

```bash
git status --short --branch
git remote -v
git branch --show-current
git diff
git diff --cached
git worktree list --porcelain
```

- GitHub操作の前に`docs/GITHUB_AUTHENTICATION.md`を読み、GitHub App、`gh`、`git push`の確認順序とフォールバック条件に従う。
- Gitリポジトリ内でない、`origin` がない、利用可能なGitHubアクセス経路がない、または現在のブランチが期待する `feature/{issue番号}` と異なる場合は、pushせず状況を報告する。
- issue番号は数字のみを許可する。
- 既にstage済みの変更を勝手にunstageしない。対象作業と無関係な変更が混在し、安全に分離できない場合だけユーザーに確認する。

認証確認後、最新のbaseとの差分を把握するため`develop`をfetchし、比較する。

```bash
git fetch origin develop
git log --oneline origin/develop..HEAD
git diff --stat origin/develop...HEAD
```

## 変更を分けてcommitする

1. `git status`、unstaged差分、staged差分を読み、今回の作業に属する変更を特定する。
2. 変更を単独で理解・レビュー・revertできる論理単位に分ける。次の場合は複数commitを検討する。
   - 独立した機能、修正、リファクタリングが混在する。
   - 実装と、それに直接対応しない文書・設定変更が混在する。
   - 生成物や機械的変更を手書きの実装から分けると履歴が明確になる。
3. 同じ目的の実装とテスト、型変更とその利用側など、分けると各commitが壊れる変更は同じcommitにまとめる。小ささだけを目的に過剰分割しない。
4. `git add .` や `git add -A` を使わず、対象パスを明示してstageする。同じファイル内に複数の論理変更がある場合は `git add -p` を使う。
5. commitごとに `git diff --cached` を確認し、秘密情報、無関係な変更、デバッグ出力、不要な生成物が含まれないことを確認する。
6. リポジトリで指定された検証を実行する。明示的な手順がなければ、変更範囲に適したテスト、lint、型チェックを可能な範囲で実行する。失敗した場合は原因を調べ、未解決のままcommitやpushを続けない。
7. リポジトリの既存規約に従ってcommitする。このリポジトリでは、規約が更新されていない限り次の形式を使う。

```bash
git commit -m "refs #{issue番号} {commitの内容を表す短い概要}"
```

8. 各commit後に `git status --short` と `git show --stat --oneline HEAD` を確認する。既存commitのamendや履歴の書き換えは、ユーザーが明示的に求めた場合だけ行う。
9. 対象変更をすべてcommitした後、`git fetch origin develop`を実行し、`git log --oneline origin/develop..HEAD`と`git diff --stat origin/develop...HEAD`を再確認する。PR対象のcommitがない場合はpushせず報告する。今回の作業と無関係な未コミット変更は変更せず、完了報告に残っていることを記載する。

## PushしてPRを作成する

1. commit済みのブランチを明示的にpushする。

```bash
git push --set-upstream origin "feature/{issue番号}"
```

2. push成功後、同じhead/baseの既存PRを確認する。GitHub Appによる検索を優先し、`docs/GITHUB_AUTHENTICATION.md`で定義された条件を満たす場合だけ`gh`へフォールバックする。

```bash
gh pr list --head "feature/{issue番号}" --base develop --state all --json number,state,url,title
```

3. openなPRがすでにある場合は重複作成せず、pushで更新された既存PRのURLを返す。closedまたはmergedのPRしかない場合は、その事実を報告し、新規PRを作るかユーザーに確認する。
4. `.github/PULL_REQUEST_TEMPLATE.md`を読み、見出しの順序と文言を変更せずに本文を作る。`Closes #{issue番号}`、変更内容、設計上の要点、実行済み検証を事実どおり記載し、UI変更がない場合もスクリーンショットの見出しを削除せず「変更なし」と記載する。実行していないテストを実行済みと書かない。
5. GitHub Appが利用可能ならそれを使い、`docs/GITHUB_AUTHENTICATION.md`で定義された条件を満たす場合だけ`gh pr create`へフォールバックする。タイトルは一字一句、指定形式に従う。CLIの場合、完成したテンプレート本文は一時ファイルに保存して`--body-file`で渡し、シェル展開の事故を避ける。

```bash
gh pr create \
  --base develop \
  --head "feature/{issue番号}" \
  --title "refs #{issue番号} {作業概要}" \
  --body-file "<一時ファイル>"
```

6. コマンド出力または `gh pr view --json url --jq .url` からPR URLを取得する。

## 完了報告する

成功時は、作成したPRのタイトルとクリック可能なURLを簡潔に出す。pushまたはPR作成に失敗した場合は、成功したように扱わず、失敗した段階とエラーの要点を示す。
