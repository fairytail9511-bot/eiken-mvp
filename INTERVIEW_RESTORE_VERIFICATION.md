# 面接本番の復元とiOS購読同期：修正・検証

Webと元iOSプロジェクトをローカル修正後、Previewと別IDの検証アプリで実機確認した。2026年11月5日、ユーザーがWebのcommit・push・本番反映と、本番用iOSのReleaseビルド検証までを承認した。**Archive作成・アップロード・審査提出・配信操作はユーザー自身が行う。**

## 2026年11月5日の実機確認と本番反映方針

- ユーザーが、StoreKit同期を有効にした検証アプリの有料状態で面接を最後まで完了。音声再生中を含む複数回のスクショ、アプリを切り替えて復帰、途中でのWeb再読み込みも問題なしと報告した。
- 自動テスト84件とWeb本番ビルドを再確認してから本番へ反映する。検証メニューは引き続きPreview限定で、本番では公開しない。
- Web更新は現行App Store版でも途中状態を復元する対策。旧ネイティブの強制reloadそのものや、停止前の録音・音声の中断を完全に除くものではない。本番反映後は現行App Store版でも再確認する。
- 本番用iOSプロジェクトは `/Users/mcgabriel/Desktop/eiken-grade1-speaking`。ユーザー指定の **Version 1.3 / Build 4** に設定し、`EikenGrade1Production` 共有Schemeを追加する。ArchiveはReleaseで、ローカルStoreKit設定・検証用ホスト・購入無効化コードは含めない。
- iOS側の権利同期はreloadしない修正版を維持し、購入・復元は元のStoreManagerのまま。署名なしReleaseビルドと実行バイナリのリンク依存を検査する。Archive・Appleへのアップロード・審査提出は行わない。
- 引継ぎ手順: [iOS Archive・提出前チェック](native/IOS_ARCHIVE_HANDOFF.md)。

## 今回用意した実機検証環境

- Preview: https://eiken-6wfp2ps4r-gabriels-projects-a753f393.vercel.app （Ready、認証保護は維持）。
- iOSコピー: `/Users/mcgabriel/eiken-mvp/ios-interview-sync-preview`。
- Scheme: `InterviewSyncPreview`、表示名「1級面接テスト」、別Bundle ID `com.fairytail9511.eiken-grade1-speaking.interviewsyncpreview`。
- StoreManagerは元のものを維持し、起動時・復帰時・取引更新時の同期を有効にしている。アプリ内購入は無効化し、実際の `Product.purchase()` へフォールバックしない。
- `InterviewTest.storekit` に元と同じ3つの商品IDを定義。テスト取引の作成・削除はMacの `Debug > StoreKit > Manage Transactions` で行う。アプリは通常のStoreKitで権利を取得する。テスト購読は起動時に消さない。
- 詳細手順: [検証用iOSアプリのREADME](../ios-interview-sync-preview/README.md)。署名・デバイス登録・インストール・実機取引は自動実行していない。
- 自動確認: Web84件、検証用コピー6件、TypeScript、iOS署名なしビルド成功。Previewのビルドも成功。
- 初回Preview作成時の本番は `dpl_A9VCXntHuezDu7LUmvzvHp2GJ2f1`、Git HEADは `98b06af`。Web本番反映前の比較元として記録する。

### 2026年11月4日：検証用アプリの起動クラッシュ修正

ユーザーの実機ログで、旧検証アプリの `Library not loaded: /Developer/Library/Frameworks/StoreKitTest.framework/StoreKitTest` と `no such file` を確認した。署名なしビルドは成功していたが、通常アプリとして実機起動する構成にDeveloper専用フレームワークを直結したことが誤りだった。

検証用コピーからStoreKitTestとSKTestSession、そのためのフレームワーク検索・実行時検索パスを削除した。代わりにApple標準のTransaction Managerからローカル取引を作成する。購読同期と別Bundle ID、PreviewのURL、保存ストレージは維持。アプリを削除する必要はない。

`verify-linked-frameworks.cjs` で実際のアプリ実行ファイル・Debug dylib・Preview dylibの依存を検査し、StoreKitTest・XCTest・Developer専用パスが残らないことを確認した。この検証アプリでの実機起動・取引操作・面接完了も後日ユーザーが確認済み。この11月4日の修正時点ではWebコード、元のDesktop iOSプロジェクト、本番、Previewの再デプロイは変更していない。

## 原因と対策

元のiOSコードは、起動時・foreground復帰時などの購読確認完了を受けて、権利状態が変わっていなくても `location.reload()` を実行していた。SmallTalkはログを書き出していても、起動時に段階・ログを読み戻さず最初の挨拶で初期化していた。この組み合わせでSmallTalkがやり直しになる経路がある。今回の個別の発生時刻と実機ログの照合は未実施。

### Web側

- `eiken_mvp_interview_progress_v1` に最後の面接1回分を保存。`runId` と現在の段階、開始時刻、段階ごとの状態を管理する。期限による自動削除はしない。
- 新規面接はホームの「面接開始」で明示的に開始。途中の面接がある場合は確認を出す。ホームの「途中の面接を再開」は新規開始扱いにせず、元の段階へ移動する。
- SmallTalk：会話・段階・自己紹介・深掘り回数・入力中の回答を復元。返答待ちで中断したら「同じ回答で質問を再取得」で既存の回答を再利用する。再送でユーザー発言を二重に追加しない。
- Topic：同じ5題・選択・入力・準備時間の終了予定時刻を復元。時間はバックグラウンド中も経過する。復元済み題材を再生成しない。
- Speech：下書き・経過時間・録音ID・Q&Aへの引継ぎ段階を復元。既存録音を消したり新しいIDへ差し替えたりしない。
- Q&A：同じ4問・現在の質問・会話・分析・入力を復元。Speechのみ／Q&Aのみ／同じ4問の復習でも、新しい復習開始時には別runとして開始する。
- ユーザー発言や回答の確定は、原則として保存が成功してから画面へ反映する。古いrun、移動済みの段階、アンマウント後の応答は現在の進行へ書き込まない。
- 復元時は過去の音声を自動再生しない。「現在の案内・質問を再生」で必要な音声を再生する。文字表示OFFでも復元・再生の導線を出す。
- SmallTalk／Speech／Q&Aの停止後の録音を保存し、文字起こし待ちが中断した場合は、保存した録音から復元するボタンを出す。音声ファイルがない場合は録り直しを案内する。
- 採点済みの応答を途中保存してから無料利用の権利情報を保存する。応答取得後、改善例の生成中などに中断しても、次は同じ採点応答を利用する。無料回数は絶対値で同期し、再開によって加算しない。採点した月も保存する。
- 面接完了後は結果へ戻し、質問生成や再採点を自動開始しない。正式保存のIndexedDB・復習リスト・トレーニング用の保存データは初期化しない。

### iOS側

- 実際の修正先：`/Users/mcgabriel/Desktop/eiken-grade1-speaking/eiken-grade1-speaking/ContentView.swift`。
- 元の作業中変更を保った限定差分を適用。`StoreManager.swift` の購入・復元・検証・権利取得処理は変更しない。
- `syncWebProAndReload` を `syncWebPro` に置き換え、`speaking_is_pro` の値を同期後 `eiken_mvp_access_changed` イベントでWeb側へ通知する。ページのreload、遷移、Webストレージ削除はしない。
- 初回のページ読み込み完了時にも同期し、Webが読み込まれる前に購読確認が終わったケースを取りこぼさない。本番の指定ホスト以外には同期スクリプトを送らない。
- ホームのプラン表示・購入案内・結果画面は、通知を受けて権利表示を更新する。面接の段階・会話は変更しない。
- 適用差分は `native/ios-pro-sync-no-reload.patch` に記録した。**ローカルの元Xcodeプロジェクトには適用済み。二重適用しない。** パスはこの作業環境のものなので他環境では読み替える。

## 自動検証

```sh
node --test tests/interview-progress.test.cjs
node --test tests/*.test.cjs
npx tsc --noEmit
npx eslint app/lib/interviewProgress.ts app/lib/useInterviewStage.ts app/components/InterviewResumeNotice.tsx
npm run build
git diff --check
```

新規開始、各段階の復元、文字表示OFF、手動再生、二重送信防止、録音からの文字起こし再開、採点応答取得後の終了・再開、無料回数・採点月の維持、完了後の結果への遷移を検証する。ネイティブに埋め込むJavaScriptについても、ProのON／OFFが同期され、reloadや他データの削除が起きないことを実行テストする。

元のiOSプロジェクトの署名なしビルド：

```sh
cd /Users/mcgabriel/Desktop/eiken-grade1-speaking
xcodebuild -quiet -project eiken-grade1-speaking.xcodeproj \
  -scheme eiken-grade1-speaking -configuration Debug \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath /private/tmp/eiken-native-pro-sync-build \
  CODE_SIGNING_ALLOWED=NO build
```

## 実機確認項目

**前回の「1級保存テスト」はStoreKitを外したアプリなので、今回の課金同期経路を検証するには不十分。** 次はStoreKit同期を有効にした別の検証ビルドを使用する。元の本番アプリを削除しない。本番と同じBundle IDの開発ビルドを不用意に上書きインストールしない。

1. SmallTalkで自己紹介まで進め、マイク許可・アプリ復帰・購読同期が走っても、挨拶からやり直さないことを確認。
2. Web側だけの復元確認として、SmallTalkの各段階、返答待ち、Topic準備中、Speech入力中／引継ぎ時、Q&Aの各問で再読み込みする。同じ段階・題材・質問・下書きを復元し、古い案内が勝手に流れないことを確認。
3. 停止後の文字起こし中に終了し、保存音声から回答を復元する。二重の回答・音声消失がないことを確認。
4. 採点応答を受けた後の改善例生成中に終了し、再開時に新しい採点リクエストや無料回数加算が発生しないことを確認。
5. 新規面接・復習・途中再開を区別し、同じ4問での復習、Speechのみ、Q&Aのみを回帰確認。以前の結果・録音・復習の進捗が保持されることを確認。
6. 検証用StoreKit環境で、無料→有料、購入キャンセル・保留、復元、期限切れを確認。権利表示は更新され、会話や録音中の画面がreloadしないことを確認する。実購入はこの手順の対象にしない。
7. 新しい面接を明示的に開始すると前の途中状態を置き換え、完了済みの記録・録音は削除しないことを確認。

## 制約・配布

- 録音中でまだ停止・保存していないメモリ上の音声は、プロセス終了から復元できない。保存済みの回答・停止後の録音を復元対象とする。SmallTalkの生音声は補助保存であり、結果画面の従来の再生対象を増やす変更ではない。
- APIの応答を受信・保存する前にプロセスが終了した場合、再試行でAPI側の処理自体が重複する可能性は残る。サーバーの永続的な冪等性・API料金の厳密な一回保証を追加したものではない。保存済みの採点応答は再利用する。
- `localStorage`の容量不足・無効化・データ消去時に永久保存を保証しない。保存エラーを表示し、不正な進行データはマウント時に勝手に新規データで上書きしない。
- クライアント側のrunチェックは単一面接の遅延応答・連打対策。複数ウィンドウ間の完全な排他を保証するものではない。
- iOS側の修正は、Webの本番更新だけでは既に配布済みのApp Store版へ適用されない。Web側の復元機能を先行して反映する場合も、ネイティブ側の配布は別途必要。
- 実機操作・StoreKit取引テストはユーザーが実施した。アシスタントの自動検証と区別する。本番反映・Archive以降の担当範囲は冒頭の合意に従う。
