# 蚕のお気持ちBOT

**2026年11月4日更新。** Driveの写真をAIが読み、蚕の気持ちを想像した短文をYouTubeライブチャットへ投稿するGoogle Apps Script（GAS）です。

## まず読むページ

| やりたいこと | 読むページ |
| --- | --- |
| 設定済みのBOTを使う・1時間投稿に更新する | **[かんたん操作ガイド](使い方ガイド.md)** |
| 初めて設定する | **[学校・個人で動かす10手順](アカウント分担の使い方.md)** |
| 日付を選んで記録を見る・日付選択エラーを直す | **[日付別ログの設定](日付別ログの設定.md)** |
| AIの回数制限や料金を確認する | [モデルと利用制限](モデルと利用制限.md) |
| 友達・開発者が実況文を改善する | [④ おきもちコメントの最適化](お気持ちコメントの改善手順.md) |
| Instagramにも画像付きで投稿する | [Instagramの導入手順](導入手順.md) |
| Xにも画像付きで投稿する | [X APIの導入手順](X_API導入手順.md) |

初めて使う人は上のガイドを順番に進めてください。以下は仕組みと設定の参照用です。

## 現在の使い方

| 担当 | すること | 自動実行する関数 |
| --- | --- | --- |
| 学校アカウント | Driveの写真 → Geminiで実況作成 → 蚕ログに保存 | `analyzeLatestImageAndLog` |
| 個人アカウント | GAS内の準備済み実況文 → YouTube投稿 | `postPreparedCommentToYouTube` |

同じGASを個人へ編集共有して使います。個人側に画像フォルダ・スプレッドシートのアクセス権は不要です。

`configureSplitAccountMode` と `configureHourlyCommentary` を実行した運用は次の設定です。

- 学校・個人の専用トリガーは**それぞれ1時間**。作成は各アカウントで1回行います。
- 同じ写真でも新しい実況を生成。直近8件を参考に、着眼点・書き出し・語尾・文体を変えるよう指示します。
- 完全一致や文字の並びが近い実況は見送り、次の解析まで待ちます。個人側は前の文を繰り返しません。
- GeminiのBOT予算は24試行/日。プレビュー・失敗・類似文の見送りも含みます。
- X・Instagramは無効です。

**コードの貼り替えだけでは、既存の30分トリガーは1時間に変わりません。** [更新手順](使い方ガイド.md)に従って作り直します。
実行時刻・学校と個人の処理順は保証されず、予算・類似文・配信状況によって投稿が1時間以上空く場合があります。

このBOTが送るのはライブチャットの文章です。写真の撮影・Drive同期・配信開始はPC側で行います。AIの実況は擬人化した想像で、健康状態の診断ではありません。

## 写真と記録の動き

写真は、設定したOBSフォルダ直下のPNG/JPEGを優先します。直下に画像がない場合だけ、直下の `YYYY-MM-DD` フォルダを新しい日付順に探します。空フォルダは飛ばし、画像がある最新の日付フォルダ内で、更新日時が最新の1枚を使います。さらに下の階層や一般名の子フォルダは探しません。

画像は5 MiB以下。古い画像も使います。ファイルの移動やコピーは行いません。
実況は70文字以内で、読み取れない数値・写真から分からない成長や動作の変化を作らないよう指示します。

「蚕ログ」には **日時・画像ファイル名・蚕の気持ち・処理ID** の4列を記録します。
変化モードの日時は解析した時刻（日本時間）で、同じ写真でも新しい実況ごとに1行保存します。以前の行の日時はそのまま残ります。
保存が完了した文を個人側が投稿します。

見るときは「日付別ログ」のB3で日付を選びます。このタブは**シート側の設定**なので、別のスプレッドシートには[作成手順](日付別ログの設定.md)を反映してください。

## GASへの導入

本体は[コード.gs](コード.gs)、サービス・権限設定は[appsscript.json](appsscript.json)です。
[初期設定の10手順](アカウント分担の使い方.md)で、アカウント準備、共有、キー、保存先、投稿テスト、自動実行まで説明しています。

APIキーは「プロジェクトの設定 → スクリプト プロパティ」に保存します。
ソースに残っている既定の保存先・配信先は以前の運用用です。自分用に初めて作る場合は、自分のフォルダ・スプレッドシート・配信動画のIDを指定します。
GASの編集者は登録済みキーと共有状態を読めます。[Google公式：設定の共有範囲](https://developers.google.com/apps-script/guides/properties)

### スクリプト プロパティ

**普段は登録済みの値を使います。** `true` / `false` は半角小文字です。
次の表は参照用です。「1時間設定後」は `configureHourlyCommentary` を実行した値を示します。

| 名前 | 値・コード単体の初期値 | 用途 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 必須 | Google AI Studioで発行したGemini APIキー |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | 固定モデルID。latest・preview名は拒否。無料提供と利用可否はプロジェクト側で確認 |
| `FOLDER_ID` | 初回は自分のIDを指定 | OBSなどの親フォルダ。直下を優先し、画像なしなら直下のYYYY-MM-DDフォルダを新しい日付順に探す |
| `SPREADSHEET_ID` | 初回は自分のIDを指定 | 履歴の保存先 |
| `CHANNEL_ID` | 動画ID未指定時は自分のチャンネルIDを指定 | 配信対象チャンネル |
| `LOG_SHEET_NAME` | `蚕ログ` | 専用のログシート。既存の最初のシートは変更しない |
| `DRY_RUN` | `true` | `true`では推論・配信確認のみ。投稿と履歴保存を有効にするには`false` |
| `SPLIT_ACCOUNT_MODE` | 分担設定後 `true`（単体の初期値は `false`） | 学校と個人の分担モード。専用関数・トリガーは分担ガイド参照 |
| `ENABLE_FEELING_VARIATION` | 1時間設定後 `true`（単体の初期値は `false`） | `configureHourlyCommentary` で有効化。同じ写真も再解析し、似た実況・同じ文の再投稿を抑制 |
| `YOUTUBE_VIDEO_ID` | 未指定 | 指定動画を直接確認する11文字のID。空ならチャンネルの自動検出 |
| `ENABLE_X` | `false` | YouTubeだけなら変更不要。Xも使用する場合は`true` |
| `ENABLE_INSTAGRAM` | `false` | Instagram画像フィード投稿を有効にする場合は`true` |
| `INSTAGRAM_USER_ID` | Instagram有効時に必須 | Instagram Loginで取得した投稿先の数値ID |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram有効時に必須 | Instagram User access token（basic・content_publish権限） |
| `INSTAGRAM_IMAGE_URL_TEMPLATE` | Instagram有効時に必須 | `{digest}` を含む公開HTTPS JPEG URL。`{fileId}` も利用可能 |
| `INSTAGRAM_API_VERSION` | `v25.0` | Instagram APIの固定バージョン |
| `INSTAGRAM_DAILY_POST_BUDGET` | `1` | 失敗を含む試行数/UTC日。間隔も `24時間 / 予算` 以上 |
| `LIVE_SEARCH_INTERVAL_MINUTES` | `60` | 他アカウントから配信を探す場合の検索間隔。60以上 |
| `GEMINI_DAILY_REQUEST_BUDGET` | 1時間設定後 `24`（単体の初期値は `48`） | 失敗・プレビューを含む試行数/日。自動実行はトリガー周期、手動実行は最短10分と `1440 / 予算` の長い方 |
| `YOUTUBE_MIN_INTERVAL_MINUTES` | 1時間設定後 `60`（単体の初期値は `30`） | 手動実行の最短投稿間隔。10以上。自動投稿はトリガーの間隔で動く |
| `YOUTUBE_DAILY_UNIT_BUDGET` | `8000` | YouTube APIの予約単位/日。予約に使うコスト前提は計算資料に記載 |
| `X_MIN_INTERVAL_MINUTES` | `30` | 最短投稿間隔。30以上。日次予算の均等配分でさらに長くなる |
| `X_DAILY_POST_BUDGET` | `1` | アップロード・投稿を含む試行数/日 |
| `X_31DAY_POST_BUDGET` | `40` | 直近31日分の試行上限。日次境界を含め保守的に集計 |
| `TWITTER_API_KEY` | X有効時に必須 | XのConsumer/API Key |
| `TWITTER_API_SECRET` | X有効時に必須 | XのConsumer/API Key Secret |
| `TWITTER_ACCESS_TOKEN` | X有効時に必須 | 投稿ユーザーのOAuth 1.0a Access Token |
| `TWITTER_ACCESS_SECRET` | X有効時に必須 | 投稿ユーザーのAccess Token Secret |

`YOUTUBE_VIDEO_ID` は現在の配信URLの `v=` の後ろの11文字です。指定するとその動画を直接確認し、空にすると `CHANNEL_ID` による配信検出を使います。配信URLが変わったら設定も更新します。
`GEMINI_MODEL` の利用可否・料金・割当は、実行するプロジェクトで確認してください。

### 投稿結果が不明になった場合

`unknown` は、送信に成功したか判定できない状態です。二重投稿を避けるため、自動再送・実況の更新を止めます。

1. 学校・個人それぞれで `removeBotTriggers` を実行します。
2. 個人側で実際のライブチャットを確認します。読取診断は `diagnosePersonalYouTube` です。
3. 保存されている実況文が投稿済みか、未投稿かを確かめます。
4. 復旧が必要な場合だけ、管理する人が `YOSAN_STATE_V1` の該当する投稿先の状態を修正します。確認済みの投稿は `sent`、未投稿を確認できた場合は `pending` とし、他の項目は残します。
5. 手動で確認してから、各アカウントの専用トリガーで再開します。

変化モードは、写真が変わってもYouTubeの `unknown` を維持します。
`YOSAN_` で始まる保存値を丸ごと削除すると、重複投稿や制限状態の消失につながります。普段の操作では変更しません。

| 保存される状態 | 意味 |
| --- | --- |
| `pending` | 未投稿・条件を満たすまで待機 |
| `sending` | 送信開始前に保存。中断時は次回 `unknown` |
| `sent` | 成功応答を受信。変化モードでは次の新しい文を待つ |
| `unknown` | 成功不明。確認が済むまで再送を停止 |

## 1アカウントで使う場合（詳細設定）

Drive・Sheets・YouTubeを同じアカウントで利用できる場合は、従来の一括処理 `processLatestImageAndLog` も使えます。
`SPLIT_ACCOUNT_MODE=false` とし、`configureHourlyCommentary`、`DRY_RUN=true` での `previewLatestImage`、`DRY_RUN=false` での手動確認の順に進めます。X・Instagramを使用しない場合はそれぞれ無効にします。

自動実行は `installThirtyMinuteTrigger` で作成してから、時計画面で `processLatestImageAndLog` を「時間ベース・1時間」へ変更します。この互換用作成関数自体は30分です。
分担用の2本は併用せず、1アカウントでは一括処理の1本で動かします。
`configureThirtyMinuteYouTube` は従来設定用です。今回の1時間運用は `configureHourlyCommentary` を使います。

## X・Instagramも使う場合

それぞれの導入手順で、アカウント・権限・料金・画像URL・投稿テストを確認してください。Instagramは既存のGemini解析文を使い、初期は有効化後も1試行/日・24時間以上の間隔です。
学校・個人の分担関数はYouTube専用です。X・Instagramの実行は、必要なアクセス権を持つアカウントで一括処理を使う構成になります。

## 開発時のテスト

Node.js 22以上で、リポジトリをダウンロードしたフォルダで実行します。追加パッケージは不要です。

```sh
npm test
```

GAS・Gemini・YouTube・X・Instagramをモックした120件があります。直近のコード変更時にはV8のNode API互換実行で120件が通過しました。実際のNode.jsによる `npm test` は、作業環境の起動失敗により未実行です。
今回の更新は文書のみで、リンク・関数名・設定値・掲載数式を確認しています。実際のGoogleの認可やAPIへの投稿を代替するテストではありません。
