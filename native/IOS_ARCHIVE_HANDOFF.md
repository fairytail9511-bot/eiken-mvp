# 本番用iOS：Archive以降の引継ぎ

2026年11月5日、ユーザーの指定により **Version 1.3 / Build 4** に設定。本番用プロジェクトのReleaseビルドまでを検証し、Archive作成・Appleへのアップロード・審査提出はユーザーが行う。

## 使用するプロジェクト

- パス: `/Users/mcgabriel/Desktop/eiken-grade1-speaking/eiken-grade1-speaking.xcodeproj`
- Scheme: **EikenGrade1Production**
- Target: `eiken-grade1-speaking`
- Bundle ID: **com.fairytail9511.eiken-grade1-speaking**
- Version / Build: **1.3 / 4**（Debug・Release両方）
- 読み込み先: **https://eiken-mvp.vercel.app**
- 購入・権利確認: 既存の本番用StoreManager。購入機能を無効化していない。
- StoreKit Configuration: **None**。共有Schemeにテスト用設定の参照はない。

**`ios-record-storage-preview`、`ios-interview-sync-preview`、`RecordStoragePreview`、`InterviewSyncPreview` は提出用ではない。**

本番用のContentViewは、権利取得時に `speaking_is_pro` と `eiken_mvp_access_changed` を同期し、ページはreloadしない。元プロジェクトのアイコン・購入コードなど、以前からの作業中変更は保持した。ネイティブ側の既存変更をまとめてcommitする操作は行っていない。

## ご本人が行う操作

1. 上記のDesktopの本番用プロジェクトを開く。
2. 上部のSchemeを **EikenGrade1Production**、実行先を **Any iOS Device (arm64)** などのiOS実機向けにする。MacやSimulatorを選ばない。
3. TargetのGeneralでVersion **1.3**、Build **4**、Signing & Capabilitiesで自分のTeamと本番Bundle IDを確認する。App Store Connectに同じVersion / Buildがすでに登録済みの場合は、その状態に合わせて変更してからArchiveする。
4. `Product > Scheme > Edit Scheme` でArchiveのBuild Configurationが **Release**、Run > OptionsのStoreKit Configurationが **None** であることを確認する。
5. `Product > Archive` を実行する。これは未実行。必要なAppleログイン・証明書・署名の確認はXcodeで行う。
6. Organizerで今回作った **1.3 (4)** のアーカイブと本番Bundle IDを確認し、`Distribute App` からApp Store Connect向けにアップロードする。
7. App Store Connectで処理完了を待ち、必要に応じて新しいiOSバージョン **1.3** を作成する。新しいビルドを選び、更新説明・審査情報・暗号化に関する質問などを確認して審査へ提出する。

アプリの削除、Webストレージ消去、本番アプリへの開発ビルドの上書きインストールは不要。審査後も更新版が利用者の端末に入るまでは、旧ネイティブの強制再読み込み処理は残る。先行したWeb更新で保存済みの進行を復元するが、保存前の録音・音声中断の完全な復旧を保証しない。

## 提出前の実機確認

- Web反映直後は、**現在のApp Store版**でもSmallTalk、スクショ、アプリ復帰を確認する。
- 新しいネイティブビルドは、必要に応じてTestFlight等で本番用構成を確認する。検証アプリだけの確認と区別する。
- 無料・有料表示、購入・復元、音声とマイク、面接完了、正式保存した記録・録音の再生を確認する。
- Developer専用のStoreKitTest/XCTestをアプリ本体に追加しない。検証用UI・テスト購読・Previewの固定URLを提出物へ入れない。

## 再実行できる開発側の検証

```sh
cd /Users/mcgabriel/Desktop/eiken-grade1-speaking
xcodebuild -quiet -project eiken-grade1-speaking.xcodeproj \
  -scheme EikenGrade1Production -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /private/tmp/eiken-grade1-production-release-check \
  CODE_SIGNING_ALLOWED=NO build

cd /Users/mcgabriel/eiken-mvp/eiken-mvp
node native/verify-production-ios.cjs \
  /Users/mcgabriel/Desktop/eiken-grade1-speaking \
  /private/tmp/eiken-grade1-production-release-check/Build/Products/Release-iphoneos/eiken-grade1-speaking.app
```

署名なしのビルド検証は、配布用の署名・Apple側のValidation・審査承認を保証するものではない。署名資産の作成・契約への同意・Appleへの送信は今回の担当範囲外。

Apple公式: [配布の準備](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution)、[ビルドのアップロード](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)、[審査への提出](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app)。
