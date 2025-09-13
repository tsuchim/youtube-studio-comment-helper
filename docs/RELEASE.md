# リリース手順メモ

このファイルは本リポジトリのリリース手順と、よくある失敗（特にバージョン不一致）への対処法をまとめたものです。

## 前提
- 次のリリースは `0.2.5` のように package.json と manifest.json の両方を同一バージョンにしてからタグを作成してリリースします。
- GitHub Actions のワークフロー: `.github/workflows/release.yml` がタグ push（`v*.*.*`）または手動実行で動きます。

## キーとなるスクリプト
- `scripts/check-version-tag.js`
  - package.json と manifest.json の version が一致しているかチェックします。
  - タグがある場合、タグ名（先頭の `v` を無視）と package.json の version が一致するかチェックします。
- `scripts/sync-manifest-version.js`
  - package.json の version を manifest.json に反映するユーティリティ（`npm run version:sync` で実行される想定）。

## リリース手順（推奨）
1. 次のバージョン番号を決める（例: `0.2.5`）。
2. package.json の `version` を更新する（例: `"version": "0.2.5"`）。
   - もしローカルで自動化したいなら、`npm version <patch|minor|major>` を使ってバンプできます。
3. manifest.json を package.json と一致させる。
   - 手動で書き換えるか、`npm run version:sync` を実行して自動同期してください。
4. 変更をコミットして push する。
   - 例（PowerShell）:

```powershell
git add package.json manifest.json
git commit -m "Bump version to 0.2.5"
git push origin <branch>
```

5. タグを作る（`v` を付けるのが慣例）

```powershell
git tag v0.2.5
git push origin v0.2.5
```

6. ワークフローが走り、以下の順で処理されます（概要）
   - ソース checkout
   - Node.js セットアップ
   - タグ解決 → 対象タグを checkout
   - `scripts/check-version-tag.js` による早期チェック（package.json と manifest.json の一致、タグと package.json の一致）
   - 依存インストール（npm ci）
   - ZIP 作成（`npm run build:zip`）
   - SHA256 生成
   - アーティファクトアップロード
   - `softprops/action-gh-release` による Release 作成/更新（ZIP と SHA を添付）

## よくある失敗と対処
- 問題: CI が "Version mismatch: package.json(0.2.4) != manifest.json(0.2.5)" で失敗する
  - 原因: `scripts/check-version-tag.js` はワークフローの早期チェック段階で package.json と manifest.json の一致を確認する。`npm run build:zip` の中で `version:sync` が走る設計になっているため、sync の前にチェックが行われると失敗する。
  - 解決:
    - 事前に `package.json` と `manifest.json` を一致させてコミットする（推奨）。
    - あるいはワークフローを修正して `version:sync` を先に実行するように順序を入れ替える（必要ならこのリポジトリで対応可）。

- 問題: Release 作成で "Resource not accessible by integration"
  - 原因: ワークフローが使用するトークンに書き込み権限がない、またはリポジトリの Actions 権限が Read only になっている。
  - 解決:
    - リポジトリ Settings → Actions → General → Workflow permissions を確認し、"Read and write permissions" を有効にする。
    - また、ワークフロー内で `softprops/action-gh-release` には `${{ secrets.GITHUB_TOKEN }}` を渡す想定。外部 PAT を使う場合は secrets に登録して参照する（ただしセキュリティポリシーに依存）。

## ローカルでのチェック手順
- バージョン一致を確認する

```powershell
# ルートで
node scripts/check-version-tag.js || echo "check failed"
# package.json と manifest.json を表示
Get-Content package.json -Raw | ConvertFrom-Json | Select-Object -ExpandProperty version
Get-Content manifest.json -Raw | ConvertFrom-Json | Select-Object -ExpandProperty version
```

- `version:sync` を実行して manifest を同期

```powershell
npm run version:sync
```

## 運用上の提案
- タグ作成前に必ず `npm run version:sync` を実行して manifest を同期した上でコミット・タグ付けする運用にすると、CI の早期チェックで落ちることがなくなります。
- あるいはワークフロー側で `version:sync` をチェックより前に実行する変更も検討してください（ワークフローを触る権限があればこちらで修正可能です）。

---

必要ならこのドキュメントに、実際のワークフローの修正パッチ（`release.yml` の `check-version-tag` 位置を移動する等）を追加で作成します。どちらの運用（事前同期 or ワークフロー順序変更）を採用したいか教えてください。
