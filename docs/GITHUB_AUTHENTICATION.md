# GitHubの認証経路とフォールバック

## 目的

CodexがGitHub操作の失敗原因を誤認せず、利用可能な認証経路だけで安全に作業を継続するための確認手順を定める。

GitHub App、GitHub CLIの`gh`、HTTPSの`git push`は、それぞれ別の認証情報と権限を使用する。一つの経路が失敗しても、他の経路まで利用不能とは限らない。

## 認証経路と用途

| 経路 | 主な用途 | 利用可否の確認方法 |
| --- | --- | --- |
| GitHub App | Issue・Pull Request・レビュー・CIの検索、読み取り、作成 | 対象リポジトリへの実際の読み取りまたは書き込みリクエスト |
| `gh` | GitHub Appで実行できないIssue・Pull Request操作のフォールバック | `gh api repos/{owner}/{repo}`の実行結果 |
| `git push` | commitとbranchのリモート公開 | 対象branchに対する、意図した`git push`の実行結果 |

認証状態を表示するコマンドだけで最終判断しない。例えば、`gh auth status`が失敗してもGitHub AppやGitのcredential helperは利用できる場合がある。反対に、GitHub AppでIssueを読めても、HTTPSのpush権限があるとは限らない。

## Issue・Pull Request操作の確認順序

1. `git remote -v`から対象の`owner/repository`を確定する。
2. GitHub Appが利用可能なら、対象リポジトリへの実リクエストを行う。
3. GitHub Appで目的の操作が成功した場合は、その経路を使用する。
4. GitHub Appの機能が提供されていない、未接続、または対象リポジトリを利用できない場合は、`gh`の実アクセスを確認する。ユーザーがGitHub Appの操作を明示的に拒否した場合は、別の認証経路で同じ操作を迂回せず停止する。
5. GitHub Appの書き込みが`403 Resource not accessible by integration`で失敗した場合は、Appに必要な書き込み権限がないものとして`gh`を確認する。
6. 次の実リクエストが成功した場合だけ、対応する`gh issue`または`gh pr`コマンドを試す。

```bash
gh api "repos/{owner}/{repo}" --jq '.full_name'
```

7. `gh api`も認証・権限エラーになった場合は、IssueやPull Requestを作成したことにせず、ユーザーへ再認証またはGitHub Appの権限変更を依頼する。`gh api`の読み取り成功は書き込み権限まで保証しないため、後続の作成操作が失敗した場合も成功扱いにしない。

GitHub Appのエラーがtimeoutなどで結果不明になった場合は、同じ書き込みを直ちに再送しない。同名Issue、同じheadとbaseのPull Request、直近のコメントなどを読み取り、既に作成されていないことを確認してから再試行する。

## `gh`へフォールバックするときの注意

- `gh auth status`の表示だけでなく、対象リポジトリへの`gh api`の結果を使用する。
- IssueやPull Requestの本文は一時ファイルへ保存し、`--body-file`で渡す。本文をコマンドへ直接埋め込まず、shell展開事故を防ぐ。
- `gh`のトークンを表示、記録、ログ出力しない。リモートURLへトークンを埋め込まない。
- assigneeやラベルなど一部の追加操作だけが失敗した場合は、作成済みのIssueやPull Requestを重複作成しない。
- GitHub Appの書き込み拒否以外のエラーを、確認せず`gh`で迂回しない。ネットワーク、入力値、重複、GitHub側障害などの可能性を先に判別する。
- ユーザーがGitHub Appでの操作を拒否した場合は、その意思を別の認証経路で迂回しない。

## `git push`の確認

`git push`はGitHub Appや`gh`とは独立して確認する。

1. `git remote -v`でpush先を確認する。
2. 現在のbranchが予定した`feature/{issue番号}`であることを確認する。
3. commitと検証が完了し、pushが依頼範囲に含まれる場合だけ、次を実行する。

```bash
git push --set-upstream origin "feature/{issue番号}"
```

4. 成功・失敗はこの実行結果で判断する。認証確認だけを目的としたダミーbranchや不要なcommitはpushしない。

`gh`のトークンが無効でも、Gitのcredential helperに有効な認証情報があればpushできる場合がある。逆に、`gh api`が成功してもGitのcredential helperが未設定ならpushは失敗し得る。

## エラーの判別

| エラーまたは状態 | 主な意味 | 対応 |
| --- | --- | --- |
| `403 Resource not accessible by integration` | GitHub Appに対象操作の権限がない | `gh api`でCLIの実アクセスを確認し、成功時だけフォールバックする |
| `401 Bad credentials`、`gh auth status`でinvalid | `gh`が使用する認証情報が無効 | GitHub Appと`git push`を別途確認し、必要なら`gh auth login`をユーザーへ依頼する |
| `Could not resolve host`、timeout | DNS、sandbox、ネットワーク、GitHub側障害の可能性 | 認証エラーと断定せず、許可付き再実行や到達性を確認する |
| `.git/index.lock: Operation not permitted` | sandboxによる`.git`への書き込み拒否 | lockを削除せず、同じGitコマンドをsandbox外実行の承認付きで再実行する |
| `non-fast-forward` | リモートbranchと履歴が競合している | 認証問題として扱わず、fetch後に履歴と差分を確認する |
| `Repository not found` | URL誤り、リポジトリ不存在、非公開リポジトリへの権限不足のいずれか | remoteとowner/repositoryを再確認し、別経路の実アクセス結果と照合する |

実際のエラー文が表にない場合も、認証エラー、権限エラー、ネットワークエラー、入力エラー、Gitの履歴競合を分けて扱う。

## 作業を止める条件と報告内容

必要な操作について、利用可能なすべての経路が失敗した場合は作業を成功扱いにしない。次をユーザーへ報告する。

- 実行しようとした操作
- 試した認証経路
- 各経路の実エラー
- 読み取りだけ、pushだけなど、引き続き可能な操作
- 必要な再認証またはGitHub App権限の変更

認証経路の変更や権限追加が必要な場合は、ユーザーの対応を待つ。権限エラーを回避するために、別アカウント、未知のトークン、リモートURLの書き換えを無断で使用しない。
