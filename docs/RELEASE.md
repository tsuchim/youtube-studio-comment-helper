
# リリース情報

リリースの入手方法と確認手順を簡潔にまとめています。技術的な詳細や再現手順は `docs/RELEASE_DEV.md` を参照してください。

■ 概要
- リリースは GitHub のタグ付きコミットから GitHub Actions でビルド・パッケージ化されます。
- 各リリースには ZIP と SHA256 チェックサムが添付されます。チェックサムはダウンロード後の改変検出に使えますが、ビルド環境や手順の保証はできません。

■ 入手方法
- 推奨：ブラウザ拡張機能ストアまたは公式配布ページから入手してください。
- ストア版は自動更新され、常に最新の修正が適用されます。

■ ZIP版の確認手順
1. ZIP をダウンロード
2. 添付の SHA256 チェックサムと照合
3. 必要に応じて `docs/RELEASE_DEV.md` で詳細手順を参照

---

English

This document summarizes how to obtain and verify releases. For technical details and reproduction steps, see `docs/RELEASE_DEV.md`.

■ Summary
- Releases are built from a tagged commit and packaged by GitHub Actions.
- Each release includes a ZIP archive and a SHA256 checksum. The checksum helps detect modifications after download, but does not guarantee the build environment or process.

■ How to get releases
- Recommended: Obtain the extension from your browser's extension store or the official distribution page.
- Store versions are updated automatically and always include the latest fixes.

■ ZIP verification steps
1. Download the ZIP
2. Compare the attached SHA256 checksum
3. For advanced verification, see `docs/RELEASE_DEV.md`

