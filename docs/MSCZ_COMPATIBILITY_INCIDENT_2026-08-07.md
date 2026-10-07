# MSCZ 変換互換性インシデントレポート

- 発生日: 2026-08-07
- 対象ファイル: `public/ライラック.mscz`
- 影響: アップロード後に楽譜を表示できない
- 状態: 対象ファイルは互換再保存により復旧。一般的な自動復旧は未実装

## 1. 結論

今回確認できた直接原因は、`webmscore` が対象の MSCZ を正常に読み込めず、**パートも小節も含まない空の MusicXML を、例外を投げずに返したこと**である。

OSMD の `Invalid number of staves.` は原因ではなく、不完全な MusicXML を描画しようとした結果として発生した二次エラーだった。

対象ファイルは MuseScore 4.4.3 で保存されていた。MuseScore 4.7.2 で開いて MSCZ として再保存すると、同じ `webmscore` で正常に変換できた。このため、対象ファイルの保存状態と `webmscore` の読み込み処理の間に互換性問題があると判断している。

ただし、現時点の調査だけでは、次のような一般化はできない。

- MuseScore 4.4.3 の全ファイルが失敗する
- MSCX の `version="4.40"` だけが原因である
- 特定の単一要素を書き換えれば安全に修復できる

「特定バージョンなら必ず失敗する」のではなく、より正確には、**少なくとも今回の4.4.3保存ファイルに、現在使用中の `webmscore` が正しく移行・解釈できない保存状態が含まれていた**という結論になる。

## 2. 使用コンポーネント

調査時点の主要依存関係は次のとおり。

| コンポーネント | バージョン | 役割 |
| --- | --- | --- |
| `webmscore` | 1.2.1 | MSCZをMusicXML/MXLへ変換 |
| `opensheetmusicdisplay` | 2.0.0 | MusicXML/MXLをSVG描画 |
| 問題ファイルの保存元 | MuseScore 4.4.3 | MSCZ/MSCX生成 |
| 互換再保存に使用 | MuseScore 4.7.2 | MSCZの読み込み・再保存 |

## 3. 発生した症状

最初に表示された主なエラーは以下だった。

```text
MusicSheetReadingException: Invalid number of staves.
Error: given music sheet was incomplete or could not be loaded.
OSMD: load() needs to be called before render()
```

当初はOSMDの描画失敗に見えたが、変換段階の出力を検査すると、OSMDへ入力する前にデータが失われていた。

## 4. データフローと障害箇所

```text
ライラック.mscz
  │
  ▼
webmscore.load('mscz', ...)
  │ 読み込み失敗を例外として通知しない
  ▼
score.saveXml()
  │ 1,521文字、score-part=0、part=0、measure=0
  ▼
OSMD.load(...)
  │ 描画可能な譜表が存在しない
  ▼
Invalid number of staves.
```

MusicXMLとMXLは同じ `webmscore` のスコアインスタンスから生成していたため、MXLへフォールバックしても空譜という根本状態は変わらなかった。

## 5. 調査結果

### 5.1 問題ファイルを直接変換した結果

対象MSCZを `webmscore` で読み込み、`saveXml()` の結果を検査した。

| 検査項目 | 結果 |
| --- | ---: |
| MusicXML文字数 | 1,521 |
| `<score-part>` 数 | 0 |
| `<part>` 数 | 0 |
| `<measure>` 数 | 0 |

XML自体は構文上整形式だったが、`<part-list>` が空で、描画・再生可能な楽譜ではなかった。

### 5.2 MSCXを直接渡した結果

MSCZ内のMSCXを取り出し、`webmscore.load('mscx', ...)` へ直接渡しても同じ空MusicXMLになった。このため、ZIP展開や日本語ファイル名だけが原因とは考えにくい。

### 5.3 バージョン文字列だけを変更した結果

MSCX先頭の `museScore version="4.40"` を `4.0` に変更して再試行したが、結果は変わらなかった。したがって、バージョン属性だけを変更する方法は解決策にならない。

### 5.4 デスクトップ版MuseScoreでの変換

同じ元ファイルをMuseScore CLIでMusicXMLへ変換すると、約1.2MBの正常なMusicXMLが生成された。元の楽譜データそのものが完全に破損していたわけではない。

### 5.5 MuseScore 4.7.2で再保存した結果

元ファイルをMuseScore 4.7.2でMSCZとして再保存し、そのファイルを同じ `webmscore` で変換した。

| 検査項目 | 結果 |
| --- | ---: |
| MusicXML文字数 | 約1,340,185 |
| `<part>` 数 | 7 |
| OSMD入力可否 | 描画可能な構造 |

この結果から、MuseScore本体の読み込み・保存処理によって、`webmscore` が解釈可能な保存状態へ移行されたと考えられる。

## 6. 原因の整理

### 確認済み

1. `webmscore` は元ファイルから空のMusicXMLを返した。
2. 空のMusicXMLをOSMDへ渡すと `Invalid number of staves.` になった。
3. MusicXMLとMXLの両方が同じ不完全な変換元に依存していた。
4. デスクトップ版MuseScoreは元ファイルを読み込めた。
5. MuseScore 4.7.2で再保存したMSCZは `webmscore` で正常に変換できた。

### 強く推定されること

- 元ファイル内の4.4.3世代の保存表現またはその組み合わせを、`webmscore` の読み込み処理が正しく移行できなかった。
- `webmscore` が読み込み失敗を例外として公開しないため、障害検知がOSMDまで遅延した。

### 未確認

- 失敗を引き起こしたMSCX要素または要素の組み合わせ
- MuseScore 4.4.3の他ファイルでの再現率
- 4.4.3以外の各MuseScoreバージョンでの影響範囲
- `webmscore` 内部で出ている読み込み警告・エラーの内容

## 7. 実施した対応

### 対象ファイルの復旧

`public/ライラック.mscz` をMuseScore 4.7.2で再保存したファイルへ置き換えた。

これは対象ファイルを利用可能にする対応であり、ユーザーが今後アップロードする同種ファイルをアプリが自動修復するものではない。

### 不完全な変換結果の検出

`src/lib/msczConverter.ts` に検証を追加し、以下のいずれかを満たすMusicXMLをOSMDへ渡さないようにした。

- XMLパースエラーがある
- `<score-part>` が0件
- `<part>` が0件
- `<measure>` が0件

これにより、原因をOSMDの描画エラーとして誤認せず、MSCZ変換エラーとしてユーザーへ通知できる。

### OSMDの二次エラー抑止

`src/hooks/useOSMD.tsx` で、ロード完了前のリサイズ描画を抑止した。また、ロード失敗時にOSMDインスタンスと描画途中のDOMを破棄するようにした。

## 8. 暫定的な運用回避策

同じエラーが発生した場合は、対象MSCZを最新版のMuseScoreで開き、「名前を付けて保存」またはMSCZへの再エクスポートを行う。

この方法には次の制約がある。

- ユーザー環境にMuseScoreが必要
- アプリ単独では完結しない
- 再保存前後で楽譜内容が維持されたか別途確認が必要

## 9. 恒久対応案

### サーバー側MuseScore CLIフォールバック

クライアント変換が空譜または失敗になったときだけ、正式なMuseScore CLIを備えた変換サービスへ送る。再現性と対応範囲の面で最も堅牢だが、サーバー運用、ファイル転送、タイムアウト、隔離実行、一時ファイル削除が必要になる。

- GitHub Issue: [#101](https://github.com/mitchi-0719/refinear/issues/101)

### クライアント内MSCX互換補正

MSCZ内のMSCXを解析し、安全に特定できる既知の非互換パターンだけを正規化する。オフライン性を維持できる一方、原因要素の特定とバージョン別フィクスチャが必要になる。バージョン番号だけの書き換えは採用しない。

- GitHub Issue: [#102](https://github.com/mitchi-0719/refinear/issues/102)

## 10. 今後の調査に必要なもの

1. 再保存前の問題MSCZをテストフィクスチャとして保持する
2. 再保存後MSCZとのMSCX構造差分を分類する
3. MuseScore保存バージョン別の最小テストファイルを用意する
4. 各ファイルについてパート数、小節数、ノート数を変換前後で比較する
5. `webmscore` の読み込みログを取得できるか調査する
6. 最小再現ファイルを作成し、必要に応じて upstream へ報告する

今回の元ファイルは調査中に再保存版へ置き換えており、Git管理前の未追跡ファイルだったため、再保存前バイナリはリポジトリから復元できない。今後は元ファイルを保持したままコピーを作成して検証する。

## 11. 再発防止の診断基準

MSCZの変換成功は「`saveXml()` が文字列を返したこと」だけで判定しない。最低限、次を確認する。

- XMLが構文上妥当
- `score-partwise/part-list/score-part` が1件以上
- `score-partwise/part` が1件以上
- `score-partwise/part/measure` が1件以上
- 可能であれば元MSCXと変換後MusicXMLのパート数を比較

`Invalid number of staves.` を観測した場合は、OSMDの設定を変更する前に、上記の入力構造を検査する。

## 12. 追記: `ダーリン.mscz` のOSMD slide描画障害

同日に `public/ダーリン.mscz` で、次の別障害を確認した。

```text
TypeError: Cannot read properties of undefined (reading 'HasEndLine')
```

このファイルの `webmscore` 変換結果は、8パート、640小節、約1.60MBの整形式MusicXMLであり、空譜問題ではなかった。MusicXMLには22個の `<slide>` 要素が含まれていた。

OSMD 2.0.0の公式ソースを追跡した結果、`HasEndLine` 参照は `GraphicalGlissando.calculateLine()` にあり、スライドが譜表の改行をまたぐ場合の描画処理で発生していた。OSMD 2.1.2へ更新し、`slide` と `glissando` の両方を元のMusicXMLのまま描画する。

これにより以下のデータを表示・再生に利用できる。

- 音符
- 小節・パート構造
- 再生情報
- ストアに保持する元MusicXML

`slide` と `glissando` はいずれもOSMDへ渡るため、楽譜上の線種を含めて描画できる。問題が再発した場合は、どちらかを非表示にするのではなく、再現データとともにOSMD側の不具合として切り分ける。
