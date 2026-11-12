# 個人用APIキーと軽量モデルで動かす

2026年11月12日確認。おすすめは **個人用の専用プロジェクト＋`gemini-3.5-flash-lite`** です。写真・記録は今までどおり学校側GASが扱い、YouTube投稿は個人側で行います。個人発行のキーでも、この分担で使えます。

## 1. 個人アカウントでAPIキーを作る

1. [Google AI StudioのAPIキー画面](https://aistudio.google.com/apikey)へ個人アカウントでログインします。
2. 利用規約を確認し、BOT用に管理するプロジェクトを選んでAPIキーを作成します。初めての利用では、既定のプロジェクトとキーが自動作成される場合があります。
3. 無料で使う場合は、そのプロジェクトが **Free** であることを確認します。有料へのアップグレードや課金設定を、この手順で行う必要はありません。
4. 「Verification needed」等が出た場合は、AI Studioに表示される端末確認を完了します。

[Google公式のキー作成手順](https://aistudio.google.com/docs/api-key)／[無料プロジェクトの確認](https://aistudio.google.com/docs/verification)

**キーはチャットやGitHubへ貼らず、GASのスクリプトプロパティにだけ保存します。** 同じプロジェクトでキーだけを作り直しても利用枠は増えません。専用プロジェクトなら、他の用途や他の利用者との消費を分けて管理できます。

## 2. 無料枠が足りるか確認する

[AI StudioのRate limits](https://aistudio.google.com/rate-limit?timeRange=last-28-days)で、キーを発行したプロジェクトと `gemini-3.5-flash-lite` の利用枠を確認します。

| 表示 | 確認すること |
| --- | --- |
| RPD | 1日の回数。通常は約24試行、失敗時の最大2回追加まで見込むなら最大72試行 |
| RPM | 1分の回数。学校の通常実行は1時間ごと。手動検証や他の利用も合計される |
| TPM | 1分の入力トークン数。画像・指示・比較履歴も使うため、回数だけで判断しない |

通常の自動運転は約24試行/日、失敗時だけ最大2回追加するので終日運転の目安は最大72試行です。手動解析を追加すれば、その分も使います。500回/日などの十分な枠があり独自上限を外したい場合は、手順3の `configureGeminiUnlimited` を実行できます。72以上使えるなら、既定の上限72試行/日を残す運用もできます。24以上72未満なら `GEMINI_DAILY_REQUEST_BUDGET` を実際の枠以下にし、再試行の余裕が減ることを見込みます。24未満・利用枠0なら、その無料枠で終日毎時運転を続けるのは難しくなります。手動解析・解析プレビュー・失敗も枠を使います。

無料枠の固定回数や毎時の成功は保証できません。[公式の制限説明](https://aistudio.google.com/docs/rate-limits)では、割当はキーではなくプロジェクト単位で、モデルや利用状況によって変わります。

## 3. GASへ登録して軽量モデルに切り替える

1. 動作中なら学校・個人それぞれで `removeBotTriggers` を実行します。
2. 学校側で[最新版コード.gs](コード.gs)の全文に貼り替えて保存します。
3. 歯車 → スクリプト プロパティの **`GEMINI_API_KEY`** を新しいキーへ置き換えて保存します。
4. 学校側で **`configureLowTokenGemini`** を1回実行します。`GEMINI_MODEL=gemini-3.5-flash-lite` を設定するだけで、APIは呼びません。
5. 独自の日次上限を外す場合は **`configureGeminiUnlimited`** を実行します。`GEMINI_DAILY_REQUEST_BUDGET=0` になり、旧版の混在した待機も整理して現モデルで再確認できるようにします。
6. `showBotUsage` の `model` が `gemini-3.5-flash-lite`、上限を外した場合は `geminiDailyLimitDisabled=true` か確認します。キーは表示されません。

`DEFAULT_GEMINI_MODEL` は既に同じ軽量モデルです。ただし登録済みの `GEMINI_MODEL` が優先されるため、コード内の定数だけを確認しても切り替わりません。

使用済み回数・`unknown`・名前の順番・比較用の物の投稿間隔は消しません。`configureGeminiUnlimited` は元の旧待機を保存して整理しますが、現在のモデルやモデル共通の確認済み待機、新形式の通信障害の待機は維持します。Googleから返された新しい待機指示も守ります。

## 4. 文章を確認して再開する

1. 学校側で `analyzeLatestImageAndLog` を実行し、画像UIの読取りと解析・記録完了を確認します。これは解析だけで、YouTubeには投稿しません。
2. `previewPreparedComment` で「日時＋名前：気持ち」を確認します。こちらは保存済み文の表示だけで、APIを呼びません。
3. 学校側で `installSchoolAnalysisTrigger`、個人側で `installPersonalYouTubeTrigger` を実行して再開します。

必要な権限の認可が出たら、各担当の権限を許可します。投稿はその後の個人側の自動処理で行います。

## トークン消費と無料について

Flash-Liteは低コスト用途向けで、画像とJSON出力に対応しています。**料金単価が低いことと、同じ写真の入力トークンが減ることは別です。** このBOTは思考量 `minimal`、UI付き出力上限512トークン、1枚・1リクエストを維持します。本文の上限は70文字です。

実際の消費は学校側の `showBotUsage` → `attempts.gemini.lastUsage` の入力・本文・思考トークンで確認します。無料枠内での利用と、有料設定済みプロジェクトの料金は別です。キーの発行だけで、既存の有料設定が無料に変わることはありません。

[モデルの公式説明](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)／[公式料金表](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)
