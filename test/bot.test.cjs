const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createContext, runInContext } = require('node:vm');
const { createHash } = require('node:crypto');

const source = readFileSync(resolve(__dirname, '../コード.gs'), 'utf8');
const PNG = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')];
const CHANNEL = 'UCJ12W_V5k49jE0M38L32Ylg';
const response = (code, body) => ({
  getResponseCode: () => code,
  getContentText: () => typeof body === 'string' ? body : JSON.stringify(body)
});
const geminiResponse = (text = '桑の葉をもぐもぐ、おなかいっぱい！') => response(200, {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }]
});
const clone = (value) => JSON.parse(JSON.stringify(value));

function harness(options = {}) {
  let now = Date.now();
  const calls = { gemini: [], sleeps: [], searches: [], broadcasts: [], videos: [], channels: 0,
    chats: [], uploads: [], tweets: [], logs: [], console: [], flushes: 0, releases: 0 };
  const values = { GEMINI_API_KEY: 'test-gemini-key', DRY_RUN: 'false', ENABLE_X: 'true',
    TWITTER_API_KEY: 'test-consumer', TWITTER_API_SECRET: 'test-consumer-secret',
    TWITTER_ACCESS_TOKEN: 'test-token', TWITTER_ACCESS_SECRET: 'test-token-secret', ...options.properties };
  const properties = {
    getProperties: () => ({ ...values }),
    getProperty: (name) => values[name] ?? null,
    setProperty(name, value) {
      if (options.failPropertyWrite?.(name, value)) throw new Error('property storage failure');
      values[name] = value;
      return this;
    },
    deleteProperty: (name) => { delete values[name]; }
  };
  const makeFile = (overrides = {}) => {
    const record = { id: 'image-1', name: 'screenshot.png', updated: now - 1000, mime: 'image/png', bytes: PNG, ...overrides };
    return {
      record,
      getId: () => record.id,
      getName: () => record.name,
      getMimeType: () => record.mime,
      getSize: () => record.size ?? record.bytes.length,
      getLastUpdated: () => new Date(record.updated),
      getBlob: () => ({ getBytes: () => record.bytes })
    };
  };
  const files = options.files ? options.files.map(makeFile) : [makeFile()];
  let data = options.sheetData ? clone(options.sheetData) : [];
  let sheetExists = Boolean(options.sheetData);
  let remainingLogFailures = options.logFailures || 0;
  let remainingFlushFailures = options.flushFailures || 0;
  const sheet = {
    getLastRow: () => data.reduce((last, row, index) => row.some((cell) => cell !== '') ? index + 1 : last, 0),
    getMaxRows: () => 1000,
    insertRowBefore: (row) => data.splice(row - 1, 0, []),
    getRange(row, column, height, width) {
      return {
        getValues: () => Array.from({ length: height }, (_, i) =>
          Array.from({ length: width }, (_, j) => data[row - 1 + i]?.[column - 1 + j] ?? '')),
        setValues(rows) {
          if (row === 2 && remainingLogFailures-- > 0) throw new Error('sheet write failure');
          rows.forEach((cells, i) => {
            data[row - 1 + i] ||= [];
            cells.forEach((cell, j) => { data[row - 1 + i][column - 1 + j] = cell; });
          });
          if (row === 2) calls.logs.push(clone(rows[0]));
        },
        createTextFinder(key) {
          return {
            matchEntireCell() { return this; },
            findNext: () => data.slice(row - 1, row - 1 + height).some((cells) => cells[column - 1] === key) ? {} : null
          };
        }
      };
    }
  };
  const spreadsheet = {
    getSheetByName: () => sheetExists ? sheet : null,
    insertSheet: () => { sheetExists = true; return sheet; }
  };
  const liveVideo = (overrides = {}) => ({ id: 'video-1', snippet: { channelId: CHANNEL },
    liveStreamingDetails: { actualStartTime: new Date(now - 600000).toISOString(), activeLiveChatId: 'chat-1' }, ...overrides });
  let videos = options.videos ?? [liveVideo()];
  const geminiQueue = [...(options.geminiResponses || [])];
  const tweetQueue = [...(options.tweetResponses || [])];
  const uploadQueue = [...(options.uploadResponses || [])];
  const service = {
    setConsumerKey() { return this; },
    setConsumerSecret() { return this; },
    setAccessToken() { return this; },
    fetch(url, request) {
      const isUpload = url.includes('/media/upload');
      (isUpload ? calls.uploads : calls.tweets).push({ url, request: clone(request) });
      const queue = isUpload ? uploadQueue : tweetQueue;
      const next = queue.length ? queue.shift() : isUpload ? response(200, { media_id_string: '1234567890123456789' }) : response(201, { data: { id: 'tweet-1' } });
      if (next instanceof Error) throw next;
      return next;
    }
  };
  const triggers = [...(options.triggers || [])].map((handler) => ({ getHandlerFunction: () => handler }));
  const context = createContext({
    console: {
      log: (...args) => calls.console.push(args.join(' ')),
      error: (...args) => calls.console.push(args.join(' '))
    },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => options.busy !== true, releaseLock: () => calls.releases++ }) },
    PropertiesService: { getScriptProperties: () => properties },
    DriveApp: { getFolderById: () => ({ getFiles: () => {
      let index = 0;
      return { hasNext: () => index < files.length, next: () => files[index++] };
    } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, bytes) => [...createHash(algorithm).update(Buffer.from(bytes)).digest()],
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      formatDate: (date, timezone) => {
        assert.equal(timezone, 'Asia/Tokyo');
        return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');
      },
      sleep: (ms) => calls.sleeps.push(ms)
    },
    UrlFetchApp: { fetch: (url, request) => {
      calls.gemini.push({ url, request: clone(request) });
      const next = geminiQueue.length ? geminiQueue.shift() : geminiResponse();
      if (next instanceof Error) throw next;
      return next;
    } },
    SpreadsheetApp: {
      openById: () => spreadsheet,
      flush: () => { calls.flushes++; if (remainingFlushFailures-- > 0) throw new Error('flush interrupted'); }
    },
    YouTube: {
      Channels: { list: () => { calls.channels++; return { items: options.ownsChannel === false ? [] : [{ id: CHANNEL }] }; } },
      LiveBroadcasts: { list: (part, params) => {
        calls.broadcasts.push({ part, params: clone(params) });
        return { items: videos };
      } },
      Search: { list: (part, params) => {
        calls.searches.push({ part, params: clone(params) });
        if (options.searchFailure) throw options.searchFailure;
        return { items: videos.map((item) => ({ id: { videoId: item.id } })) };
      } },
      Videos: { list: (part, params) => {
        calls.videos.push({ part, params: clone(params) });
        return { items: videos.filter((item) => params.id.split(',').includes(item.id)) };
      } },
      LiveChatMessages: { insert: (payload, part) => {
        calls.chats.push({ payload: clone(payload), part });
        if (options.chatFailure) throw options.chatFailure;
        return { id: 'message-1' };
      } }
    },
    OAuth1: { createService: () => service },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (trigger) => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger(handler) {
        return { timeBased() { return this; }, everyMinutes(minutes) { assert.equal(minutes, 10); return this; },
          create() { triggers.push({ getHandlerFunction: () => handler }); } };
      }
    }
  });
  runInContext(source, context, { filename: 'コード.gs' });
  return { calls, values, files, triggers, context, makeFile, liveVideo,
    setVideos: (next) => { videos = next; },
    advance: (ms) => { now += ms; },
    run: () => context.processLatestImageAndLog(),
    preview: () => context.previewLatestImage(),
    state: () => JSON.parse(values.YOSAN_STATE_V1),
    data: () => data };
}

test('成功後の再実行で推論・記録・YouTube・Xを重複しない', () => {
  const h = harness();
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.run().x, 'sent');
  for (const name of ['gemini', 'logs', 'chats', 'uploads', 'tweets']) assert.equal(h.calls[name].length, 1, name);
  assert.equal(h.calls.gemini[0].request.headers['x-goog-api-key'], 'test-gemini-key');
  assert.ok(!h.calls.gemini[0].url.includes('test-gemini-key'));
  assert.ok(h.calls.gemini[0].url.endsWith('/gemini-flash-latest:generateContent'));
  assert.equal(h.calls.uploads[0].request.contentType, 'application/x-www-form-urlencoded');
  assert.equal(h.calls.uploads[0].request.payload.media_data, Buffer.from(PNG).toString('base64'));
  assert.equal(JSON.parse(h.calls.tweets[0].request.payload).media.media_ids[0], '1234567890123456789');
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.releases, 2);
});

test('最新の非画像を除外し、画像の更新日時で選ぶ', () => {
  const h = harness({ files: [
    { name: 'new.txt', mime: 'text/plain', updated: Date.now() },
    { id: 'old', name: 'old.png', updated: Date.now() - 10000 },
    { id: 'updated', name: 'updated.png', updated: Date.now() - 1000 }
  ] });
  h.run();
  assert.equal(h.calls.logs[0][1], 'updated.png');
});

test('同じファイルIDへの上書きも新しい画像として処理する', () => {
  const h = harness();
  h.run();
  h.files[0].record.updated += 500;
  h.files[0].record.bytes = [...PNG, 1];
  h.run();
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(h.calls.chats.length, 2);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.broadcasts.length, 2);
  assert.equal(h.calls.videos.length, 2);
});

test('空フォルダと古い画像ではAPIを呼ばない', () => {
  for (const [files, expected] of [[[], 'no_image'], [[{ updated: Date.now() - 21 * 60000 }], 'stale_image']]) {
    const h = harness({ files });
    assert.equal(h.run().status, expected);
    assert.equal(h.calls.gemini.length, 0);
    assert.equal(h.calls.chats.length, 0);
  }
});

test('octet-streamでも実データがPNGなら正しいMIMEを使う', () => {
  const h = harness({ files: [{ mime: 'application/octet-stream' }] });
  h.run();
  const payload = JSON.parse(h.calls.gemini[0].request.payload);
  assert.equal(payload.contents[0].parts[1].inlineData.mimeType, 'image/png');
});

test('偽PNG・空画像・巨大画像は推論前に拒否する', () => {
  for (const file of [{ bytes: [1, 2, 3] }, { bytes: [] }, { size: 6 * 1024 * 1024 }]) {
    const h = harness({ files: [file] });
    assert.throws(h.run, /PNG\/JPEG|画像/);
    assert.equal(h.calls.gemini.length, 0);
    assert.equal(h.calls.releases, 1);
  }
});

test('Geminiの429/5xxだけを上限付きで再試行する', () => {
  const h = harness({ geminiResponses: [response(429, {}), response(503, {}), geminiResponse()] });
  h.run();
  assert.equal(h.calls.gemini.length, 3);
  assert.deepEqual(h.calls.sleeps, [1000, 2000]);
  const failed = harness({ geminiResponses: [response(503, {}), response(503, {}), response(503, {})] });
  assert.throws(failed.run, /HTTP 503/);
  assert.equal(failed.calls.gemini.length, 3);
  assert.equal(failed.calls.logs.length, 0);
});

test('Gemini認証エラーは再試行せず、記録・投稿しない', () => {
  const h = harness({ geminiResponses: [response(401, { error: { message: 'private-body' } })] });
  assert.throws(h.run, /HTTP 401/);
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.calls.chats.length, 0);
});

test('不正JSON・安全性ブロック・空回答・出力上限では投稿しない', () => {
  const cases = [response(200, 'invalid json'), response(200, 'null'),
    response(200, { promptFeedback: { blockReason: 'SAFETY' } }), geminiResponse(' '),
    response(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '途中' }] } }] })];
  for (const result of cases) {
    const h = harness({ geminiResponses: [result] });
    assert.throws(h.run);
    assert.equal(h.calls.logs.length, 0);
    assert.equal(h.calls.tweets.length, 0);
  }
});

test('エラーという単語を含む正常回答も投稿できる', () => {
  const h = harness({ geminiResponses: [geminiResponse('画面のエラーより、桑の葉が気になるなあ。')] });
  h.run();
  assert.equal(h.calls.chats.length, 1);
});

test('思考パートを除外し、Unicodeを壊さず70文字以内にする', () => {
  const h = harness({ geminiResponses: [response(200, { candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: '非公開の思考', thought: true }, { text: '蚕'.repeat(40) }, { text: '🐛'.repeat(40) }
  ] } }] })] });
  h.run();
  assert.equal(Array.from(h.state().feeling).length, 70);
  assert.ok(!h.state().feeling.includes('思考'));
  const tweet = JSON.parse(h.calls.tweets[0].request.payload).text;
  const weighted = Array.from(tweet.replace(/https:\/\/\S+/g, 'a'.repeat(23)))
    .reduce((sum, char) => sum + (char.codePointAt(0) <= 127 ? 1 : 2), 0);
  assert.ok(weighted <= 280, 'Xの文字数上限');
});

test('履歴の書き込み失敗時は投稿せず、次回に同じ推論結果を使う', () => {
  const h = harness({ logFailures: 1 });
  assert.throws(h.run, /sheet write/);
  assert.equal(h.calls.chats.length, 0);
  h.run();
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
  assert.equal(h.calls.chats.length, 1);
});

test('履歴保存直後に中断しても処理IDで既存行を見つける', () => {
  const h = harness({ flushFailures: 1 });
  assert.throws(h.run, /flush/);
  assert.equal(h.state().logged, false);
  h.run();
  assert.equal(h.calls.logs.length, 1);
  assert.equal(h.state().logged, true);
});

test('既存シートの見出しが違えば書き換えず停止する', () => {
  const h = harness({ sheetData: [['別のデータ', '名前', '備考']] });
  assert.throws(h.run, /見出し/);
  assert.deepEqual(h.data(), [['別のデータ', '名前', '備考']]);
  assert.equal(h.calls.chats.length, 0);
});

test('ファイル名とAI出力をスプレッドシートの数式として実行しない', () => {
  const h = harness({ files: [{ name: '=HYPERLINK("x").png' }], geminiResponses: [geminiResponse('=1+1')] });
  h.run();
  assert.ok(h.calls.logs[0][1].startsWith("'="));
  assert.equal(h.calls.logs[0][2], "'=1+1");
});

test('YouTube成功後にXが429で失敗した場合、Xだけを再試行する', () => {
  const h = harness({ tweetResponses: [response(429, {})] });
  h.run();
  assert.equal(h.state().youtube, 'sent');
  assert.equal(h.state().x, 'pending');
  h.run();
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 1);
  assert.equal(h.calls.tweets.length, 2);
  assert.equal(h.state().x, 'sent');
});

test('YouTube投稿のタイムアウトでは自動再送せず、Xは独立して成功する', () => {
  const h = harness({ chatFailure: new Error('network timeout containing a secret') });
  h.run();
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(h.state().x, 'sent');
  h.run();
  assert.equal(h.calls.chats.length, 1);
  assert.ok(!h.calls.console.join('\n').includes('secret'));
});

test('X投稿の5xx・不明な成功応答・タイムアウトでは再送しない', () => {
  for (const result of [response(503, {}), response(201, {}), new Error('timeout')]) {
    const h = harness({ tweetResponses: [result] });
    h.run(); h.run();
    assert.equal(h.state().x, 'unknown');
    assert.equal(h.calls.tweets.length, 1);
  }
});

test('X画像アップロード失敗なら次回再試行できる', () => {
  const h = harness({ uploadResponses: [response(403, {})] });
  h.run();
  assert.equal(h.state().x, 'pending');
  assert.equal(h.calls.tweets.length, 0);
  h.run();
  assert.equal(h.calls.uploads.length, 2);
  assert.equal(h.calls.chats.length, 1);
  assert.equal(h.calls.tweets.length, 1);
});

test('送信直前の状態が残った場合はunknownとして扱う', () => {
  const h = harness();
  h.run();
  const state = h.state();
  state.youtube = 'sending';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  h.run();
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(h.calls.chats.length, 1);
});

test('状態保存ができなければ外部送信を始めない', () => {
  const h = harness({ failPropertyWrite: (name, value) => name === 'YOSAN_STATE_V1' && JSON.parse(value).youtube === 'sending' });
  h.run();
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.tweets.length, 1);
});

test('別アカウントでライブなしなら高コスト検索を1時間に1回へ制限する', () => {
  const h = harness({ ownsChannel: false, videos: [], properties: { MAX_IMAGE_AGE_MINUTES: '300' } });
  h.run();
  h.advance(10 * 60000);
  h.run();
  assert.equal(h.calls.searches.length, 1);
  h.advance(50 * 60000);
  h.run();
  assert.equal(h.calls.searches.length, 2);
  assert.equal(h.calls.chats.length, 0);
});

test('所有者のライブ未開始は10分後に再検出できる', () => {
  const h = harness({ videos: [] });
  h.run();
  h.advance(10 * 60000);
  h.setVideos([h.liveVideo()]);
  h.run();
  assert.equal(h.calls.broadcasts.length, 2);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.chats.length, 1);
});

test('別アカウントでも検索結果の配信IDを再利用する', () => {
  const h = harness({ ownsChannel: false });
  h.run();
  h.files[0].record.updated += 500;
  h.run();
  assert.equal(h.calls.searches.length, 1);
  assert.equal(h.calls.videos.length, 2);
  assert.equal(h.calls.chats.length, 2);
});

test('ライブ終了時はキャッシュを破棄して新しいライブへ切り替える', () => {
  const h = harness();
  h.run();
  const old = h.liveVideo();
  old.liveStreamingDetails.actualEndTime = new Date().toISOString();
  const next = h.liveVideo({ id: 'video-2' });
  next.liveStreamingDetails.activeLiveChatId = 'chat-2';
  h.setVideos([old, next]);
  h.files[0].record.updated += 500;
  h.run();
  assert.equal(h.calls.chats[1].payload.snippet.liveChatId, 'chat-2');
  assert.equal(h.values['YOSAN_LIVE_VIDEO_' + CHANNEL], 'video-2');
});

test('複数ライブでは開始日時が新しい配信を選ぶ', () => {
  const h = harness();
  const old = h.liveVideo();
  old.liveStreamingDetails.actualStartTime = '2020-01-01T00:00:00Z';
  const next = h.liveVideo({ id: 'video-2' });
  next.liveStreamingDetails.activeLiveChatId = 'chat-2';
  h.setVideos([old, next]);
  h.run();
  assert.equal(h.calls.chats[0].payload.snippet.liveChatId, 'chat-2');
});

test('所有者では古いライブが継続中でも新しく始まった配信へ切り替える', () => {
  const h = harness();
  h.run();
  const previous = h.liveVideo();
  const next = h.liveVideo({ id: 'video-2' });
  next.liveStreamingDetails.actualStartTime = new Date().toISOString();
  next.liveStreamingDetails.activeLiveChatId = 'chat-2';
  h.setVideos([previous, next]);
  h.files[0].record.updated += 500;
  h.run();
  assert.equal(h.calls.chats[1].payload.snippet.liveChatId, 'chat-2');
});

test('別チャンネル・終了済み・詳細なし・チャット無効には投稿しない', () => {
  const h = harness();
  const bad = [h.liveVideo({ snippet: { channelId: 'other' } }), h.liveVideo({ liveStreamingDetails: {} }),
    h.liveVideo({ liveStreamingDetails: { actualStartTime: '2020-01-01', actualEndTime: '2020-01-02' } }),
    h.liveVideo({ liveStreamingDetails: undefined }), h.liveVideo({ liveStreamingDetails: { actualStartTime: '2020-01-01' } })];
  for (const video of bad) {
    const run = harness({ videos: [video] });
    run.run();
    assert.equal(run.calls.chats.length, 0);
    assert.equal(run.calls.tweets.length, 1);
  }
});

test('プレビューはGemini推論を行い、履歴・投稿・処理済み状態を作らない', () => {
  const h = harness();
  assert.equal(h.preview().status, 'preview');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, undefined);
  h.run();
  assert.equal(h.calls.chats.length, 1);
});

test('DRY_RUN・ENABLE_Xの初期値はプレビューのみ・X無効', () => {
  const h = harness({ properties: { DRY_RUN: undefined, ENABLE_X: undefined, TWITTER_API_KEY: undefined } });
  assert.equal(h.run().status, 'preview');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.context.getConfig_().enableX, false);
});

test('Xを無効にすればOAuth1ライブラリとX秘密鍵は不要', () => {
  const h = harness({ properties: { ENABLE_X: 'false', TWITTER_API_KEY: undefined } });
  delete h.context.OAuth1;
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.calls.uploads.length, 0);
});

test('設定不備・保存状態破損は黙って処理済み状態を消さず停止する', () => {
  const cases = [
    { GEMINI_API_KEY: undefined }, { GEMINI_MODEL: 'bad/model?key=secret' },
    { DRY_RUN: 'FALSE' }, { MAX_IMAGE_AGE_MINUTES: '-1' },
    { LIVE_SEARCH_INTERVAL_MINUTES: '10' }, { YOSAN_STATE_V1: 'broken' }
  ];
  for (const properties of cases) {
    const h = harness({ properties });
    assert.throws(h.run);
    assert.equal(h.calls.chats.length, 0);
    assert.equal(h.calls.releases, 1);
  }
});

test('同時実行をスキップする', () => {
  const h = harness({ busy: true });
  assert.equal(h.run().status, 'busy');
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.releases, 0);
});

test('トリガー再作成は他のハンドラーを削除せず10分トリガーを1つにする', () => {
  const h = harness({ triggers: ['otherHandler', 'processLatestImageAndLog', 'processLatestImageAndLog'] });
  h.context.installTenMinuteTrigger();
  h.context.installTenMinuteTrigger();
  assert.deepEqual(h.triggers.map((trigger) => trigger.getHandlerFunction()), ['otherHandler', 'processLatestImageAndLog']);
  h.context.removeBotTriggers();
  assert.deepEqual(h.triggers.map((trigger) => trigger.getHandlerFunction()), ['otherHandler']);
  h.values.DRY_RUN = 'true';
  assert.throws(() => h.context.installTenMinuteTrigger(), /DRY_RUN/);
});

test('例外の生メッセージや接続URLをログへ流さない', () => {
  const h = harness();
  assert.ok(!h.context.safeError_(new Error('YouTube failure secret-key')).includes('secret-key'));
  assert.equal(h.context.safeError_(new Error('API failed: quotaExceeded; secret-key')), 'quotaExceeded');
  const failure = harness({ geminiResponses: [new Error('fetch https://api?key=private-key')] });
  assert.throws(failure.run, (error) => !error.message.includes('private-key'));
});
