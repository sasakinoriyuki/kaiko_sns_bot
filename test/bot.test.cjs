const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createContext, runInContext } = require('node:vm');
const { createHash } = require('node:crypto');

const source = readFileSync(resolve(__dirname, '../コード.gs'), 'utf8');
const PNG = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')];
const CHANNEL = 'UCJ12W_V5k49jE0M38L32Ylg';
const response = (code, body, headers = {}) => ({
  getResponseCode: () => code,
  getAllHeaders: () => headers,
  getContentText: () => typeof body === 'string' ? body : JSON.stringify(body)
});
const geminiResponse = (text = 'ぼく、桑の葉をもぐもぐ、おなかいっぱい！') => response(200, {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }]
});
const clone = (value) => JSON.parse(JSON.stringify(value));

function harness(options = {}) {
  let now = options.now ?? Date.now();
  const calls = { triggerIntervals: [], gemini: [], sleeps: [], searches: [], broadcasts: [], videos: [], channels: 0,
    channelRequests: [], playlists: [], scopes: [], driveFileScans: [], driveFolderScans: [], instagram: [], publicImages: [], chats: [], uploads: [], tweets: [], logs: [], console: [], flushes: 0, releases: 0 };
  const values = { ENABLE_REARING_CONTEXT: 'false', GEMINI_API_KEY: 'test-gemini-key', DRY_RUN: 'false', ENABLE_X: 'true',
    TWITTER_API_KEY: 'test-consumer', TWITTER_API_SECRET: 'test-consumer-secret',
    TWITTER_ACCESS_TOKEN: 'test-token', TWITTER_ACCESS_SECRET: 'test-token-secret',
    GEMINI_DAILY_REQUEST_BUDGET: '144', YOUTUBE_MIN_INTERVAL_MINUTES: '10', X_DAILY_POST_BUDGET: '48', X_31DAY_POST_BUDGET: '1600',
    ...options.properties };
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
  const iterator = (items) => {
    let index = 0;
    return { hasNext: () => index < items.length, next: () => items[index++] };
  };
  const makeFolder = (record) => ({
    getName: () => record.name,
    getFiles: () => {
      calls.driveFileScans.push(record.name);
      return iterator((record.files || []).map(makeFile));
    },
    getFolders: () => {
      calls.driveFolderScans.push(record.name);
      return iterator((record.folders || []).map(makeFolder));
    }
  });
  const folder = {
    getFiles: () => { calls.driveFileScans.push('OBS'); return iterator(files); },
    getFolders: () => {
      calls.driveFolderScans.push('OBS');
      return iterator((options.folders || []).map(makeFolder));
    }
  };
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
      (isUpload ? calls.uploads : calls.tweets).push({ at: now, url, request: clone(request) });
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
    DriveApp: { getFolderById: () => folder },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, bytes) => [...createHash(algorithm).update(Buffer.from(bytes)).digest()],
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      formatDate: (date, timezone, format) => {
        if (format === 'yyyy-MM-dd') return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(date);
        assert.equal(timezone, 'Asia/Tokyo');
        const formatted = new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');
        return format === 'yyyy/MM/dd' ? formatted.slice(0, 10) : format === 'yyyy/MM/dd HH:mm' ? formatted.slice(0, 16) : formatted;
      },
      sleep: (ms) => calls.sleeps.push(ms)
    },
    UrlFetchApp: { fetch: (url, request) => {
      if (url.startsWith('https://images.example/')) {
        calls.publicImages.push({ url, request: clone(request) });
        if (options.publicFailure) throw options.publicFailure;
        return { ...response(options.publicCode || 200, ''),
          getBlob: () => ({ getBytes: () => options.publicBytes || files[0].record.bytes }) };
      }
      if (url.startsWith('https://graph.instagram.com/')) {
        calls.instagram.push({ at: now, url, request: clone(request) });
        const kind = url.includes('/media_publish') ? 'publish' : request.method === 'get' ? 'status' : 'create';
        const next = options.instagramReply
          ? options.instagramReply(kind, calls.instagram.length)
          : response(200, kind === 'status' ? { status_code: 'FINISHED' } : { id: kind === 'create' ? '1234' : '5678' });
        if (next instanceof Error) throw next;
        return next;
      }
      calls.gemini.push({ at: now, url, request: clone(request) });
      const next = geminiQueue.length ? geminiQueue.shift() : geminiResponse();
      if (next instanceof Error) throw next;
      return next;
    } },
    SpreadsheetApp: {
      openById: () => spreadsheet,
      flush: () => { calls.flushes++; if (remainingFlushFailures-- > 0) throw new Error('flush interrupted'); }
    },
    YouTube: {
      Channels: { list: (part, params) => {
        calls.channels++; calls.channelRequests.push({ part, params: clone(params) });
        if (params.id) return { items: options.targetChannel === null ? [] : [options.targetChannel || {
          id: params.id, snippet: { title: 'テスト配信チャンネル' },
          ...(options.uploads !== undefined ? { contentDetails: { relatedPlaylists: { uploads: 'uploads-playlist' } } } : {})
        }] };
        return { items: options.ownsChannel === false ? [] : [{ id: CHANNEL }] };
      } },
      PlaylistItems: { list: (part, params) => {
        calls.playlists.push({ part, params: clone(params) });
        if (options.playlistFailure) throw options.playlistFailure;
        return { items: (options.uploads || []).map(id => ({ contentDetails: { videoId: id } })) };
      } },
      LiveBroadcasts: { list: (part, params) => {
        calls.broadcasts.push({ part, params: clone(params) });
        return { items: videos };
      } },
      Search: { list: (part, params) => {
        calls.searches.push({ part, params: clone(params) });
        if (options.searchFailure) throw options.searchFailure;
        return { items: options.searchItems ?? videos.map((item) => ({ id: { videoId: item.id } })) };
      } },
      Videos: { list: (part, params) => {
        calls.videos.push({ part, params: clone(params) });
        return { items: videos.filter((item) => params.id.split(',').includes(item.id)) };
      } },
      LiveChatMessages: { insert: (payload, part) => {
        calls.chats.push({ at: now, payload: clone(payload), part });
        if (options.chatFailure) throw options.chatFailure;
        return { id: 'message-1' };
      } }
    },
    OAuth1: { createService: () => service },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' },
      requireScopes: (mode, scopes) => {
        calls.scopes.push({ mode, scopes: [...scopes] });
        if (options.allowedScopes && scopes.some(scope => !options.allowedScopes.includes(scope))) throw new Error('forbidden scope');
      },
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (trigger) => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger(handler) {
        return { timeBased() { return this; }, everyMinutes(minutes) { assert.equal(minutes, 30); calls.triggerIntervals.push({ handler, minutes }); return this; }, everyHours(hours) { assert.equal(hours, 1); calls.triggerIntervals.push({ handler, hours }); return this; },
          create() { triggers.push({ getHandlerFunction: () => handler }); } };
      }
    }
  });
  runInContext(source, context, { filename: 'コード.gs' });
  return { calls, values, files, triggers, context, makeFile, liveVideo,
    setVideos: (next) => { videos = next; },
    advance: (ms) => { now += ms; },
    now: () => now,
    refreshImage: () => { files[0].record.updated = now - 1000; },
    run: () => context.processLatestImageAndLog(),
    runTrigger: () => context.processLatestImageAndLog({ triggerUid: 'test-trigger' }),
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
  assert.ok(h.calls.gemini[0].url.endsWith('/gemini-3.5-flash-lite:generateContent'));
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
  h.advance(10 * 60000);
  h.refreshImage();
  h.files[0].record.bytes = [...PNG, 1];
  h.run();
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(h.calls.chats.length, 2);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.broadcasts.length, 2);
  assert.equal(h.calls.videos.length, 2);
});

test('空フォルダではAPIを呼ばない', () => {
  const h = harness({ files: [] });
  assert.equal(h.run().status, 'no_image');
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.chats.length, 0);
});

test('古い画像でも処理し、旧MAX_IMAGE_AGE_MINUTESは無視する', () => {
  const h = harness({ files: [{ updated: Date.now() - 30 * 86400000 }], properties: { MAX_IMAGE_AGE_MINUTES: '1' } });
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.calls.gemini.length, 1);
  assert.ok(!h.calls.console.join('\n').includes('最新画像が古いため'));
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

test('Geminiの429では停止し、5xxも即時リトライしない', () => {
  const h = harness({ geminiResponses: [response(429, {}), geminiResponse()] });
  assert.equal(h.run().status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 1);
  assert.deepEqual(h.calls.sleeps, []);
  assert.equal(h.run().status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 1);
  const failed = harness({ geminiResponses: [response(503, {})] });
  assert.throws(failed.run, /HTTP 503/);
  assert.equal(failed.calls.gemini.length, 1);
  assert.equal(failed.run().status, 'rate_limited');
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
  const h = harness({ geminiResponses: [geminiResponse('ぼく、さっきのエラーより桑の葉が気になるなあ。')] });
  h.run();
  assert.equal(h.calls.chats.length, 1);
});

test('思考パートを除外し、Unicodeを壊さず70文字以内にする', () => {
  const h = harness({ geminiResponses: [response(200, { candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: '非公開の思考', thought: true }, { text: 'ぼく、のんびり気分。' + '葉'.repeat(40) }, { text: '🐛'.repeat(40) }
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
  const h = harness({ files: [{ name: '=HYPERLINK("x").png' }], geminiResponses: [geminiResponse('=1+1 ぼくの気分')] });
  h.run();
  assert.ok(h.calls.logs[0][1].startsWith("'="));
  assert.equal(h.calls.logs[0][2], "'=1+1 ぼくの気分");
});

test('YouTube成功後にXが429で失敗した場合、Xだけを再試行する', () => {
  const h = harness({ tweetResponses: [response(429, {})], properties: { MAX_IMAGE_AGE_MINUTES: '3000' } });
  h.run();
  assert.equal(h.state().youtube, 'sent');
  assert.equal(h.state().x, 'pending');
  h.run();
  assert.equal(h.calls.tweets.length, 1);
  h.advance(24 * 3600000);
  h.run();
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 2);
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
  const h = harness({ uploadResponses: [response(403, {})], properties: { MAX_IMAGE_AGE_MINUTES: '120' } });
  h.run();
  assert.equal(h.state().x, 'pending');
  assert.equal(h.calls.tweets.length, 0);
  h.advance(30 * 60000);
  h.run();
  assert.equal(h.calls.uploads.length, 2);
  assert.equal(h.calls.chats.length, 2);
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
  h.advance(10 * 60000);
  h.refreshImage();
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
  h.advance(10 * 60000);
  h.refreshImage();
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
  h.advance(10 * 60000);
  h.refreshImage();
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
    { DRY_RUN: 'FALSE' }, { GEMINI_DAILY_REQUEST_BUDGET: '-1' },
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

test('トリガー再作成は他のハンドラーを削除せず初期30分トリガーを1つにする', () => {
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

test('初期予算で24時間の10分トリガーを動かすとGemini・YouTubeは48回まで', () => {
  const h = harness({ now: Date.parse('2026-10-07T07:00:00Z'), properties: {
    GEMINI_DAILY_REQUEST_BUDGET: undefined, YOUTUBE_MIN_INTERVAL_MINUTES: undefined, ENABLE_X: 'false'
  } });
  for (let i = 0; i < 144; i++) {
    if (i) h.advance(10 * 60000);
    h.refreshImage();
    h.run();
  }
  assert.equal(h.calls.gemini.length, 48);
  assert.equal(h.calls.chats.length, 48);
  assert.equal(h.calls.logs.length, 48);
  for (let i = 1; i < h.calls.gemini.length; i++) {
    assert.ok(h.calls.gemini[i].at - h.calls.gemini[i - 1].at >= 30 * 60000);
  }
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.count, 48 * 53);
});

test('予算確認後の10分/30分設定を24時間動かして144解析・48X試行を超えない', () => {
  const h = harness({ now: Date.parse('2026-10-07T07:00:00Z'),
    geminiResponses: Array.from({ length: 144 }, (_, i) => geminiResponse('ぼく、桑の葉をもぐもぐ幸せ ' + i)) });
  for (let i = 0; i < 144; i++) {
    if (i) h.advance(10 * 60000);
    h.refreshImage();
    h.run();
  }
  assert.equal(h.calls.gemini.length, 144);
  assert.equal(h.calls.chats.length, 144);
  assert.equal(h.calls.tweets.length, 48);
  for (let i = 1; i < h.calls.tweets.length; i++) {
    assert.ok(h.calls.tweets[i].at - h.calls.tweets[i - 1].at >= 30 * 60000);
  }
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.count, 7632);
});

test('プレビューの結果を同一画像の本番で使い、解析を重複しない', () => {
  const h = harness({ properties: { GEMINI_DAILY_REQUEST_BUDGET: undefined } });
  h.preview(); h.preview(); h.run();
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 1);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).gemini.count, 1);
});

test('異なる画像でも手動で解析間隔を短縮できない', () => {
  const h = harness({ properties: { GEMINI_DAILY_REQUEST_BUDGET: undefined } });
  h.run(); h.advance(10 * 60000); h.refreshImage();
  assert.equal(h.run().status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
});

test('Geminiの日次予算はPacific日付で停止・リセットする', () => {
  const h = harness({ now: Date.parse('2026-10-07T07:00:00Z'), properties: {
    GEMINI_DAILY_REQUEST_BUDGET: '16', YOSAN_LIMITS_V1: JSON.stringify({ gemini: { day: '2026-10-07', count: 16 } })
  } });
  assert.equal(h.run().status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 0);
  h.advance(24 * 3600000); h.refreshImage(); h.run();
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).gemini.count, 1);
});

test('Pacificの夏時間終了日は25時間後の午前0時を待つ', () => {
  const h = harness({ now: Date.parse('2026-11-01T07:00:00Z') });
  const reset = h.context.nextQuotaReset_();
  assert.ok(Math.abs(reset - Date.parse('2026-11-02T08:00:00Z')) <= 1000);
});

test('GeminiのRetry-Afterが日次リセットより長ければ短縮しない', () => {
  const h = harness({ geminiResponses: [response(429, {}, { 'Retry-After': '172800' })] });
  h.run();
  assert.ok(JSON.parse(h.values.YOSAN_LIMITS_V1).gemini.cooldownUntil >= h.now() + 48 * 3600000);
});

test('YouTubeは直接の手動呼び出しでも10分未満で再投稿しない', () => {
  const h = harness();
  const config = h.context.getConfig_();
  h.context.postLatestCommentToYouTube('ぼく、桑の葉がおいしいな。', 'chat-1', config);
  h.advance(9 * 60000);
  assert.throws(() => h.context.postLatestCommentToYouTube('ぼく、まだもぐもぐ食べたいな。', 'chat-1', config), (error) => error.botWait);
  assert.equal(h.calls.chats.length, 1);
  h.advance(60000);
  h.context.postLatestCommentToYouTube('ぼく、桑の葉がおいしいな。', 'chat-1', config);
  assert.equal(h.calls.chats.length, 2);
});

test('YouTubeのクォータ予算が足りなければ未送信のpendingを維持する', () => {
  const h = harness({ properties: { YOUTUBE_DAILY_UNIT_BUDGET: '52' } });
  h.run();
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.state().youtube, 'pending');
  assert.equal(h.state().x, 'sent');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.count, 3);
});

test('YouTubeのquotaExceededでは次の日までAPIを止める', () => {
  const h = harness({ now: Date.parse('2026-11-05T12:00:00Z'), ownsChannel: false, searchFailure: new Error('quotaExceeded') });
  h.run();
  const searches = h.calls.searches.length;
  h.advance(60 * 60000); h.refreshImage(); h.run();
  assert.equal(h.calls.searches.length, searches);
  assert.equal(h.calls.channels, 1);
});

test('Xの初期設定は有効化しても1日1回で、翌日までアップロードしない', () => {
  const h = harness({ properties: { X_DAILY_POST_BUDGET: undefined, X_31DAY_POST_BUDGET: undefined },
    geminiResponses: [geminiResponse('ぼく、一日目の桑が楽しみ'), geminiResponse('ぼく、二日目の桑が楽しみ'), geminiResponse('ぼく、次の日の桑が楽しみ')] });
  h.run(); h.advance(30 * 60000); h.refreshImage(); h.run();
  assert.equal(h.calls.uploads.length, 1);
  h.advance(24 * 3600000); h.refreshImage(); h.run();
  assert.equal(h.calls.uploads.length, 2);
});

test('Xの31日予算に達するとAPIを呼ばず、古い日次集計だけを除去する', () => {
  const h = harness({ now: Date.parse('2026-10-07T07:00:00Z'), properties: {
    X_31DAY_POST_BUDGET: '40', YOSAN_LIMITS_V1: JSON.stringify({ x: { days: { '2026-10-06': 40 } } })
  } });
  h.run();
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.tweets.length, 0);
  h.advance(32 * 86400000); h.refreshImage(); h.run();
  assert.equal(h.calls.uploads.length, 1);
  assert.ok(!JSON.parse(h.values.YOSAN_LIMITS_V1).x.days['2026-10-06']);
});

test('Xのレート残量・resetヘッダーに合わせて次の試行を遅らせる', () => {
  const now = Date.parse('2026-10-07T07:00:00Z');
  const h = harness({ now, tweetResponses: [response(201, { data: { id: 'tweet-1' } }, {
    'x-rate-limit-remaining': '0', 'x-rate-limit-reset': String(now / 1000 + 7200)
  })], geminiResponses: [geminiResponse('ぼく、最初の桑が楽しみ'), geminiResponse('ぼく、次の桑が楽しみ'), geminiResponse('ぼく、次のぼく、次の桑が楽しみが楽しみ')] });
  h.run(); h.advance(30 * 60000); h.refreshImage(); h.run();
  assert.equal(h.calls.uploads.length, 1);
  h.advance(92 * 60000); h.refreshImage(); h.run();
  assert.equal(h.calls.tweets.length, 2);
});

test('Xの同じ文面は翌日も連続投稿しない', () => {
  const h = harness();
  h.run(); h.advance(24 * 3600000); h.refreshImage(); h.run();
  assert.equal(h.calls.chats.length, 2);
  assert.equal(h.calls.tweets.length, 1);
});

test('制限状態を保存できなければGeminiを呼ばない', () => {
  const h = harness({ failPropertyWrite: (name) => name === 'YOSAN_LIMITS_V1' });
  assert.throws(h.run, /property storage/);
  assert.equal(h.calls.gemini.length, 0);
});

test('壊れた制限状態と短すぎる間隔は停止し、予算を黙ってリセットしない', () => {
  const cases = [ { YOSAN_LIMITS_V1: '[]' }, { YOSAN_LIMITS_V1: 'false' }, { YOSAN_LIMITS_V1: 'null' },
    { YOSAN_LIMITS_V1: JSON.stringify({ gemini: null }) },
    { YOSAN_LIMITS_V1: JSON.stringify({ x: { days: 0 } }) },
    { YOSAN_LIMITS_V1: JSON.stringify({ gemini: { count: -1 } }) },
    { YOSAN_LIMITS_V1: JSON.stringify({ x: { days: { '2026-10-07': '2' } } }) },
    { GEMINI_DAILY_REQUEST_BUDGET: '2.5' }, { GEMINI_MODEL: 'gemini-flash-latest' },
    { YOUTUBE_MIN_INTERVAL_MINUTES: '5' }, { X_MIN_INTERVAL_MINUTES: '10' } ];
  for (const properties of cases) {
    const h = harness({ properties });
    assert.throws(h.run);
    assert.equal(h.calls.gemini.length, 0);
    assert.equal(h.calls.chats.length, 0);
  }
});

test('利用状況はキーを出さず、実レスポンスのトークン数を表示する', () => {
  const data = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '桑の葉がおいしい' }] } }],
    usageMetadata: { promptTokenCount: 980, candidatesTokenCount: 28, thoughtsTokenCount: 0 } };
  const h = harness({ geminiResponses: [response(200, data)] });
  h.run();
  const report = h.context.showBotUsage();
  assert.equal(report.attempts.gemini.lastUsage.promptTokenCount, 980);
  assert.equal(report.attempts.gemini.lastUsage.thoughtsTokenCount, 0);
  assert.ok(!JSON.stringify(report).includes('test-gemini-key'));
  const payload = JSON.parse(h.calls.gemini[0].request.payload);
  assert.equal(payload.generationConfig.maxOutputTokens, 256);
  assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
});


const JPEG = [255, 216, 255, 224, 0, 16, 74, 70, 73, 70];
function instagramHarness(options = {}) {
  return harness({
    ...options,
    files: options.files || [{ name: 'photo.jpg', mime: 'image/jpeg', bytes: JPEG }],
    properties: {
      ENABLE_X: 'false', ENABLE_INSTAGRAM: 'true',
      INSTAGRAM_USER_ID: '17841400000000000',
      INSTAGRAM_ACCESS_TOKEN: 'private-instagram-token',
      INSTAGRAM_IMAGE_URL_TEMPLATE: 'https://images.example/{digest}.jpg',
      ...options.properties
    }
  });
}

test('Instagramは初期状態で無効、認証情報不要、1日予算は1回', () => {
  const h = harness();
  assert.equal(h.context.getConfig_().enableInstagram, false);
  assert.equal(h.context.getConfig_().instagramDailyBudget, 1);
  assert.equal(h.run().instagram, 'disabled');
  assert.equal(h.calls.instagram.length, 0);
});

test('Instagramは同じJPEGと解析結果で投稿し、再実行しても重複しない', () => {
  const h = instagramHarness();
  h.preview();
  assert.equal(h.calls.instagram.length, 0);
  assert.equal(h.calls.publicImages.length, 0);
  assert.equal(h.run().instagram, 'sent');
  h.run();
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.instagram.length, 3);
  assert.equal(h.calls.publicImages.length, 1);
  assert.equal(h.state().instagramId, '5678');
  const create = h.calls.instagram[0];
  assert.equal(create.request.payload.caption, '【今の蚕の気持ち💭】\n' + h.state().feeling);
  assert.ok(!create.url.includes('private-instagram-token'));
  assert.equal(create.request.headers.Authorization, 'Bearer private-instagram-token');
  assert.ok(!JSON.stringify(h.context.showBotUsage()).includes('private-instagram-token'));
  assert.ok(!h.calls.console.join('\n').includes('private-instagram-token'));
});

test('既存の保存状態にInstagramフィールドがなくても解析せず追加する', () => {
  const h = instagramHarness({ properties: { ENABLE_INSTAGRAM: 'false' } });
  h.run();
  const state = h.state(); delete state.instagram;
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  h.values.ENABLE_INSTAGRAM = 'true';
  assert.equal(h.run().instagram, 'sent');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 1);
});

test('Instagram初期予算は日付をまたいでも24時間未満なら投稿しない', () => {
  const h = instagramHarness({ now: Date.parse('2026-10-07T23:30:00Z') });
  h.run();
  h.advance(60 * 60000); h.refreshImage(); h.run();
  assert.equal(h.calls.instagram.filter(x => x.url.endsWith('/media')).length, 1);
  h.advance(23 * 3600000); h.refreshImage(); h.run();
  assert.equal(h.calls.instagram.filter(x => x.url.endsWith('/media')).length, 2);
});

test('Instagramの失敗試行も予算に含みYouTubeの成功に影響しない', () => {
  const h = instagramHarness({ publicCode: 403 });
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.state().instagram, 'pending');
  h.run();
  assert.equal(h.calls.publicImages.length, 1);
  assert.equal(h.calls.instagram.length, 0);
});

test('Instagramの画像がPNG・別JPEG・非画像なら公開コンテナを作らない', () => {
  for (const options of [
    { files: [{ bytes: PNG }] },
    { publicBytes: [...JPEG, 1] },
    { publicBytes: [1, 2, 3] },
    { publicBytes: PNG }
  ]) {
    const h = instagramHarness(options);
    assert.equal(h.run().youtube, 'sent');
    assert.equal(h.calls.instagram.length, 0);
  }
});

test('Instagram処理中のコンテナは保存して次回に公開、予算を再消費しない', () => {
  let finished = false;
  const h = instagramHarness({ instagramReply: kind => response(200,
    kind === 'status' ? { status_code: finished ? 'FINISHED' : 'IN_PROGRESS' } : { id: kind === 'create' ? '1234' : '5678' }) });
  h.run();
  assert.equal(h.state().instagram, 'pending');
  assert.equal(h.state().instagramContainerId, '1234');
  finished = true;
  h.run();
  assert.equal(h.state().instagram, 'sent');
  assert.equal(h.calls.publicImages.length, 1);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).instagram.count, 1);
});

test('Instagramの公開タイムアウト・5xx・不正JSON・ID欠落では自動再送しない', () => {
  for (const result of [new Error('timeout private-instagram-token'), response(503, {}),
    response(200, 'invalid json'), response(200, {})]) {
    const h = instagramHarness({ instagramReply: kind => kind === 'publish' ? result :
      response(200, kind === 'status' ? { status_code: 'FINISHED' } : { id: '1234' }) });
    h.run(); h.run();
    assert.equal(h.state().instagram, 'unknown');
    assert.equal(h.calls.instagram.filter(x => x.url.includes('media_publish')).length, 1);
    assert.ok(!h.calls.console.join('\n').includes('private-instagram-token'));
  }
});

test('Instagram公開の明確な4xx拒否はコンテナを保持し再試行できる', () => {
  let rejected = true;
  const h = instagramHarness({ properties: { MAX_IMAGE_AGE_MINUTES: '3000' }, instagramReply: kind => kind === 'publish'
    ? rejected ? response(403, {}) : response(200, { id: '5678' })
    : response(200, kind === 'status' ? { status_code: 'FINISHED' } : { id: '1234' }) });
  h.run(); assert.equal(h.state().instagram, 'pending');
  rejected = false; h.run();
  assert.equal(h.state().instagram, 'pending');
  h.advance(24 * 3600000); h.run();
  assert.equal(h.state().instagram, 'sent');
  assert.equal(h.calls.publicImages.length, 1);
});

test('Instagramの429後はコンテナの確認も待機する', () => {
  const h = instagramHarness({ instagramReply: kind => kind === 'publish' ? response(429, {}, { 'Retry-After': '172800' }) :
    response(200, kind === 'status' ? { status_code: 'FINISHED' } : { id: '1234' }) });
  h.run(); h.run();
  assert.equal(h.calls.instagram.length, 3);
  assert.equal(h.state().instagram, 'pending');
  assert.ok(JSON.parse(h.values.YOSAN_LIMITS_V1).instagram.cooldownUntil >= h.now() + 48 * 3600000);
});

test('InstagramコンテナのERROR・EXPIREDは停止、PUBLISHEDはunknownで再公開しない', () => {
  for (const status of ['ERROR', 'EXPIRED', 'PUBLISHED']) {
    const h = instagramHarness({ instagramReply: kind => response(200,
      kind === 'status' ? { status_code: status } : { id: '1234' }) });
    h.run(); h.run();
    assert.equal(h.state().instagram, status === 'PUBLISHED' ? 'unknown' : 'failed');
    assert.equal(h.calls.instagram.filter(x => x.url.includes('media_publish')).length, 0);
  }
});

test('Instagramの送信状態・成功後の保存失敗から二重公開しない', () => {
  let fail = true;
  const h = instagramHarness({ failPropertyWrite: (name, value) => name === 'YOSAN_STATE_V1' &&
    JSON.parse(value).instagram === 'sent' && fail });
  h.run(); fail = false; h.run();
  assert.equal(h.state().instagram, 'unknown');
  assert.equal(h.calls.instagram.filter(x => x.url.includes('media_publish')).length, 1);
});

test('Instagramの公開直前に状態保存できなければ送信しない', () => {
  const h = instagramHarness({ failPropertyWrite: (name, value) => name === 'YOSAN_STATE_V1' &&
    JSON.parse(value).instagram === 'sending' });
  h.run();
  assert.equal(h.calls.instagram.filter(x => x.url.includes('media_publish')).length, 0);
});

test('Instagramの設定不備・制限状態破損は投稿前に停止する', () => {
  for (const properties of [
    { ENABLE_INSTAGRAM: 'TRUE' }, { INSTAGRAM_ACCESS_TOKEN: undefined },
    { INSTAGRAM_USER_ID: 'username' }, { INSTAGRAM_IMAGE_URL_TEMPLATE: 'https://images.example/latest.jpg' },
    { INSTAGRAM_IMAGE_URL_TEMPLATE: 'http://images.example/{digest}.jpg' },
    { INSTAGRAM_API_VERSION: 'v25.0/path' }, { INSTAGRAM_DAILY_POST_BUDGET: '1.5' },
    { YOSAN_LIMITS_V1: JSON.stringify({ instagram: { count: -1 } }) }
  ]) {
    const h = instagramHarness({ properties });
    assert.throws(h.run);
    assert.equal(h.calls.instagram.length, 0);
  }
});


test('OBS直下に画像があれば日付フォルダを調べず直下を優先する', () => {
  const h = harness({ folders: [{ name: '2026-10-31', files: [{ name: 'child.png', updated: Date.now() }] }] });
  h.run();
  assert.equal(h.calls.logs[0][1], 'screenshot.png');
  assert.deepEqual(h.calls.driveFolderScans, []);
});

test('OBS直下に非画像しかなければ最新の日付フォルダ内の最新画像を選ぶ', () => {
  const now = Date.now();
  const h = harness({ files: [{ name: 'input.txt', mime: 'text/plain' }], folders: [
    { name: '2026-10-30', files: [{ name: 'older-date.png', updated: now }] },
    { name: '2026-10-31', files: [
      { name: 'old.png', updated: now - 10000 },
      { name: 'latest.jpg', mime: 'application/octet-stream', updated: now - 1000 },
      { name: 'input.txt', mime: 'text/plain', updated: now }
    ] }
  ] });
  h.run();
  assert.equal(h.calls.logs[0][1], 'latest.jpg');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 1);
  h.run();
  assert.equal(h.calls.chats.length, 1);
  assert.ok(!h.calls.driveFileScans.includes('2026-10-30'));
});

test('最新の日付フォルダが空または非画像のみなら一つ前の日付を探す', () => {
  const h = harness({ files: [], folders: [
    { name: '2026-10-31', files: [] },
    { name: '2026-10-30', files: [{ name: 'input.txt', mime: 'text/plain' }] },
    { name: '2026-10-29', files: [{ name: 'fallback.png' }] }
  ] });
  h.run();
  assert.equal(h.calls.logs[0][1], 'fallback.png');
  assert.deepEqual(h.calls.driveFileScans, ['OBS', '2026-10-31', '2026-10-30', '2026-10-29']);
});

test('日付形式以外・存在しない日付・二重の下位フォルダは探さない', () => {
  const h = harness({ files: [], folders: [
    ...['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-32', '2026-1-01', 'archive'].map(name =>
      ({ name, files: [{ name: 'invalid.png' }] })),
    { name: '2026-10-31', folders: [{ name: '2026-10-31', files: [{ name: 'nested.png' }] }] },
    { name: '2024-02-29', files: [{ name: 'valid-leap-day.png' }] }
  ] });
  h.run();
  assert.equal(h.calls.logs[0][1], 'valid-leap-day.png');
  assert.deepEqual(h.calls.driveFileScans, ['OBS', '2026-10-31', '2024-02-29']);
  assert.deepEqual(h.calls.driveFolderScans, ['OBS']);
});

test('同じ日付のフォルダが複数あればその中の最新画像を選ぶ', () => {
  const now = Date.now();
  const h = harness({ files: [], folders: [
    { name: '2026-10-31', files: [{ name: 'first.png', updated: now - 10000 }] },
    { name: '2026-10-31', files: [{ name: 'second.png', updated: now - 1000 }] }
  ] });
  h.run();
  assert.equal(h.calls.logs[0][1], 'second.png');
});

test('日付フォルダにも画像がなければ解析・履歴・投稿を行わない', () => {
  const h = harness({ files: [], folders: [{ name: '2026-10-31' }] });
  assert.equal(h.run().status, 'no_image');
  for (const name of ['gemini', 'logs', 'chats', 'tweets']) assert.equal(h.calls[name].length, 0);
});

test('日付フォルダの古い画像も処理し直下の古い画像を引き続き優先する', () => {
  const stale = Date.now() - 21 * 60000;
  for (const options of [
    { files: [], folders: [{ name: '2026-10-31', files: [{ updated: stale }] }] },
    { files: [{ updated: stale }], folders: [{ name: '2026-10-31', files: [{}] }] }
  ]) {
    const h = harness(options);
    assert.equal(h.run().youtube, 'sent');
    assert.equal(h.calls.gemini.length, 1);
    assert.equal(h.calls.chats.length, 1);
  }
});


test('初期設定で同じ古い画像を30分ごとに投稿し解析と履歴は再利用する', () => {
  const h = harness({ files: [{ updated: Date.now() - 100 * 86400000 }], properties: {
    YOUTUBE_MIN_INTERVAL_MINUTES: undefined, GEMINI_DAILY_REQUEST_BUDGET: undefined, ENABLE_X: 'false'
  } });
  assert.equal(h.context.getConfig_().youtubeMinMinutes, 30);
  assert.equal(h.context.getConfig_().geminiDailyBudget, 48);
  h.run(); h.advance(29 * 60000); h.run();
  assert.equal(h.calls.chats.length, 1);
  h.advance(60000); h.run(); h.run();
  assert.equal(h.calls.chats.length, 2);
  h.advance(30 * 60000); h.run();
  assert.equal(h.calls.chats.length, 3);
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
  assert.equal(h.calls.chats[0].payload.snippet.textMessageDetails.messageText,
    h.calls.chats[2].payload.snippet.textMessageDetails.messageText);
});

test('24時間同じ画像でもYouTube48回、Geminiと履歴は1回だけ', () => {
  const h = harness({ now: Date.parse('2026-11-02T08:00:00Z'), properties: {
    YOUTUBE_MIN_INTERVAL_MINUTES: undefined, GEMINI_DAILY_REQUEST_BUDGET: undefined, ENABLE_X: 'false'
  } });
  for (let i = 0; i < 144; i++) { if (i) h.advance(10 * 60000); h.run(); }
  assert.equal(h.calls.chats.length, 48);
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
  for (let i = 1; i < h.calls.chats.length; i++) assert.ok(h.calls.chats[i].at - h.calls.chats[i-1].at >= 30 * 60000);
});

test('同じ画像の再投稿結果が不明なら30分後も再送しない', () => {
  const h = harness({ properties: { YOUTUBE_MIN_INTERVAL_MINUTES: '30' } });
  h.run();
  let attempts = 0;
  h.context.YouTube.LiveChatMessages.insert = () => { attempts++; throw new Error('timeout'); };
  h.advance(30 * 60000); h.run();
  assert.equal(h.state().youtube, 'unknown');
  h.advance(30 * 60000); h.run();
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(attempts, 1);
});

test('旧sent状態は保存済みの最終投稿時刻を使って30分後に再投稿する', () => {
  const h = harness({ properties: { YOUTUBE_MIN_INTERVAL_MINUTES: '30' } });
  h.run();
  const state = h.state(); delete state.youtubeSentAt;
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  h.advance(29 * 60000); h.run();
  assert.equal(h.calls.chats.length, 1);
  h.advance(60000); h.run();
  assert.equal(h.calls.chats.length, 2);
});

test('最終投稿時刻もない旧sent状態は移行時にすぐ再投稿しない', () => {
  const h = harness({ properties: { YOUTUBE_MIN_INTERVAL_MINUTES: '30' } });
  h.run();
  const state = h.state(); delete state.youtubeSentAt;
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1); delete limits.youtube.lastPost;
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
  h.run(); assert.equal(h.calls.chats.length, 1);
  h.advance(30 * 60000); h.run();
  assert.equal(h.calls.chats.length, 2);
});

test('30分設定の移行関数は認証・投稿済み状態・使用済み予算を維持する', () => {
  const h = harness({ properties: { MAX_IMAGE_AGE_MINUTES: '20' } });
  h.run();
  const state = h.values.YOSAN_STATE_V1, limits = h.values.YOSAN_LIMITS_V1;
  h.context.configureThirtyMinuteYouTube();
  assert.equal(h.values.YOUTUBE_MIN_INTERVAL_MINUTES, '30');
  assert.equal(h.values.GEMINI_DAILY_REQUEST_BUDGET, '48');
  assert.equal(h.values.MAX_IMAGE_AGE_MINUTES, undefined);
  assert.equal(h.values.GEMINI_API_KEY, 'test-gemini-key');
  assert.equal(h.values.YOSAN_STATE_V1, state);
  assert.equal(h.values.YOSAN_LIMITS_V1, limits);
});


test('自動投稿は固定の手動間隔を使わずトリガーの5分周期に従う', () => {
  const h = harness({ properties: { YOUTUBE_MIN_INTERVAL_MINUTES: '60', ENABLE_X: 'false' } });
  h.runTrigger(); h.advance(5 * 60000); h.runTrigger(); h.advance(5 * 60000); h.runTrigger();
  assert.equal(h.calls.chats.length, 3);
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
});

test('新しい画像もトリガー周期で解析するがGeminiの日次予算は超えない', () => {
  const h = harness({ properties: { GEMINI_DAILY_REQUEST_BUDGET: '2', ENABLE_X: 'false' } });
  h.runTrigger(); h.advance(5 * 60000); h.refreshImage(); h.runTrigger();
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(h.calls.chats.length, 2);
  h.advance(5 * 60000); h.refreshImage();
  assert.equal(h.runTrigger().status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 2);
});

test('トリガーの連続発火でも1分未満の重複投稿を抑える', () => {
  const h = harness({ properties: { ENABLE_X: 'false' } });
  h.runTrigger(); h.runTrigger();
  assert.equal(h.calls.chats.length, 1);
  h.advance(60000); h.runTrigger();
  assert.equal(h.calls.chats.length, 2);
});

test('30分トリガーの作成・再作成で他のトリガーを維持する', () => {
  const h = harness({ triggers: ['otherHandler', 'processLatestImageAndLog'] });
  h.context.installThirtyMinuteTrigger();
  h.context.installThirtyMinuteTrigger();
  assert.deepEqual(h.triggers.map(x => x.getHandlerFunction()), ['otherHandler', 'processLatestImageAndLog']);
});


const SCHOOL_SCOPES = ['drive.readonly', 'spreadsheets', 'script.external_request', 'script.scriptapp']
  .map(s => 'https://www.googleapis.com/auth/' + s);
const PERSONAL_SCOPES = ['youtube.force-ssl', 'script.scriptapp']
  .map(s => 'https://www.googleapis.com/auth/' + s);
function preparedSchool(options = {}) {
  const h = harness({ ...options, allowedScopes: SCHOOL_SCOPES, properties: {
    SPLIT_ACCOUNT_MODE: 'true', ENABLE_X: 'true', TWITTER_API_KEY: undefined, ...options.properties
  } });
  delete h.context.YouTube;
  return h;
}
function personalWithPrepared(school, options = {}) {
  const h = harness({ ...options, allowedScopes: PERSONAL_SCOPES, properties: {
    ...school.values, GEMINI_API_KEY: undefined, YOUTUBE_VIDEO_ID: 'J1XMapSSHeI', ...options.properties
  } });
  h.setVideos([h.liveVideo({ id: 'J1XMapSSHeI', snippet: { channelId: 'actual-video-channel' } })]);
  delete h.context.DriveApp; delete h.context.SpreadsheetApp; delete h.context.UrlFetchApp;
  h.context.PropertiesService.getScriptProperties().getProperties = () => { throw new Error('個人側で全設定を読み取らない'); };
  return h;
}

test('学校側はYouTubeの権限・APIなしで画像解析と記録だけを行う', () => {
  const h = preparedSchool();
  assert.equal(h.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'prepared');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.state().logged, true);
  assert.ok(h.calls.scopes.every(call => !call.scopes.some(s => s.includes('youtube'))));
  assert.ok(!h.values.YOSAN_STATE_V1.includes('base64'));
});

test('学校用プレビューはYouTubeへ接続せず解析だけを確認する', () => {
  const h = preparedSchool();
  assert.equal(h.context.previewSchoolAnalysis().status, 'preview');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, undefined);
});

test('分担モードでは旧ハンドラーを学校側で使ってもYouTubeを呼ばない', () => {
  const h = preparedSchool();
  assert.equal(h.run().status, 'prepared');
  assert.equal(h.calls.chats.length, 0);
});

test('個人側はDrive・Sheets・Geminiキーなしで共有された実況文を投稿する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  assert.equal(h.calls.chats.length, 1);
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.calls.driveFileScans.length, 0);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.channels, 0);
  assert.equal(h.calls.videos[0].params.id, 'J1XMapSSHeI');
  assert.ok(h.calls.scopes.every(call => call.scopes.every(s => s.includes('youtube'))));
  h.advance(5 * 60000);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  assert.equal(h.calls.chats.length, 2);
});

test('学校側の同じ画像の再実行は個人側の投稿済み状態を変えない', () => {
  const h = preparedSchool(); h.context.analyzeLatestImageAndLog();
  const state = h.state(); state.youtube = 'sent'; state.youtubeSentAt = h.now() - 3600000;
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  h.context.analyzeLatestImageAndLog({ triggerUid: 'school' });
  assert.equal(h.state().youtube, 'sent');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
});

test('学校側の準備や記録が未完了なら個人側は投稿しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  for (const state of [undefined, { ...school.state(), logged: false }, { ...school.state(), feeling: '' }]) {
    const h = personalWithPrepared(school, { properties: { YOSAN_STATE_V1: state && JSON.stringify(state) } });
    assert.equal(h.context.postPreparedCommentToYouTube().status, 'waiting_analysis');
    assert.equal(h.calls.chats.length, 0);
    assert.equal(h.calls.videos.length, 0);
  }
});

test('個人側もDRY_RUNでは投稿せず保存済みの文だけ返す', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { properties: { DRY_RUN: 'true' } });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'preview');
  assert.equal(h.calls.chats.length, 0);
});

test('個人側の通信失敗・成功保存失敗でも不明な投稿を自動再送しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  for (const options of [
    { chatFailure: new Error('timeout private-token') },
    { failPropertyWrite: (name, value) => name === 'YOSAN_STATE_V1' && JSON.parse(value).youtube === 'sent' }
  ]) {
    const h = personalWithPrepared(school, options);
    h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
    assert.equal(h.state().youtube, 'unknown');
    h.advance(30 * 60000);
    assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'unknown');
    assert.equal(h.calls.chats.length, 1);
    assert.ok(!h.calls.console.join('\n').includes('private-token'));
  }
});

test('個人側も送信前の状態保存ができなければ投稿を始めない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { failPropertyWrite: (name, value) =>
    name === 'YOSAN_STATE_V1' && JSON.parse(value).youtube === 'sending' });
  h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
  assert.equal(h.calls.chats.length, 0);
});

test('個人側の配信確認は実況文・画像の準備なしで行えて投稿しない', () => {
  const school = preparedSchool();
  const h = personalWithPrepared(school);
  assert.equal(h.context.previewYouTubeConnection().status, 'ready');
  assert.equal(h.calls.chats.length, 0);
});

test('指定動画が終了済みやチャットなしなら個人側も待機する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  h.setVideos([h.liveVideo({ id: 'J1XMapSSHeI', liveStreamingDetails: { actualStartTime: '2026-01-01', actualEndTime: '2026-01-02' } })]);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'no_live');
  assert.equal(h.calls.chats.length, 0);
});

test('個人側のAPI予算と連続発火制限を引き続き守る', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const limited = personalWithPrepared(school, { properties: { YOUTUBE_DAILY_UNIT_BUDGET: '1' } });
  assert.equal(limited.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'rate_limited');
  assert.equal(limited.calls.chats.length, 0);
  const h = personalWithPrepared(school);
  h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
  h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
  assert.equal(h.calls.chats.length, 1);
});

test('アカウント別のトリガー作成で不要な権限を要求しない', () => {
  const school = preparedSchool({ triggers: ['otherHandler', 'processLatestImageAndLog'] });
  school.context.installSchoolAnalysisTrigger();
  assert.deepEqual(school.triggers.map(t => t.getHandlerFunction()), ['otherHandler', 'analyzeLatestImageAndLog']);
  assert.ok(school.calls.scopes.every(call => !call.scopes.some(s => s.includes('youtube'))));
  const personal = personalWithPrepared(school, { triggers: ['otherHandler', 'postPreparedCommentToYouTube'] });
  personal.context.installPersonalYouTubeTrigger();
  assert.deepEqual(personal.triggers.map(t => t.getHandlerFunction()), ['otherHandler', 'postPreparedCommentToYouTube']);
});

test('分担設定はキー・予算・既存の投稿状態を維持し動画IDを自動登録しない', () => {
  const h = harness(); h.run();
  const state = h.values.YOSAN_STATE_V1, limits = h.values.YOSAN_LIMITS_V1;
  h.context.configureSplitAccountMode();
  assert.equal(h.values.SPLIT_ACCOUNT_MODE, 'true');
  assert.equal(h.values.ENABLE_X, 'false');
  assert.equal(h.values.ENABLE_INSTAGRAM, 'false');
  assert.equal(h.values.YOUTUBE_VIDEO_ID, undefined);
  assert.equal(h.values.GEMINI_API_KEY, 'test-gemini-key');
  assert.equal(h.values.YOSAN_STATE_V1, state);
  assert.equal(h.values.YOSAN_LIMITS_V1, limits);
});

test('動画ID指定にはURLを受け付けず、別の有効な設定済みIDは維持する', () => {
  const h = harness({ properties: { YOUTUBE_VIDEO_ID: 'https://youtube.com/watch?v=J1XMapSSHeI' } });
  assert.throws(() => h.context.getYouTubeOnlyConfig_(), /動画ID/);
  h.values.YOUTUBE_VIDEO_ID = 'ABCDEFGHIJK';
  h.context.configureSplitAccountMode();
  assert.equal(h.values.YOUTUBE_VIDEO_ID, 'ABCDEFGHIJK');
});


test('学校側の処理は個人側の動画ID設定ミスにも依存しない', () => {
  const h = preparedSchool({ properties: { YOUTUBE_VIDEO_ID: 'invalid-url' } });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.calls.gemini.length, 1);
});


test('個人側診断は投稿チャンネル・配信・準備状態を確認し投稿や状態変更はしない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school), before = h.values.YOSAN_STATE_V1;
  const result = h.context.diagnosePersonalYouTube();
  assert.equal(result.status, 'diagnosed');
  assert.equal(result.channelAvailable, true);
  assert.equal(result.liveChatAvailable, true);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, before);
  assert.equal(h.calls.releases, 1);
});

test('投稿用YouTubeチャンネルがない場合を診断できる', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false });
  assert.equal(h.context.diagnosePersonalYouTube().channelAvailable, false);
  assert.ok(h.calls.console.join('\n').includes('チャンネルが作成済みか'));
  assert.equal(h.calls.chats.length, 0);
});

test('投稿失敗の段階と理由を保存し、unknownの状態は維持する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const failure = new Error('API call to youtube.liveChatMessages.insert failed with error: youtubeSignupRequired');
  const h = personalWithPrepared(school, { chatFailure: failure });
  const result = h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
  assert.equal(result.stage, 'チャット投稿API');
  assert.equal(result.code, 'youtubeSignupRequired');
  assert.equal(h.state().youtube, 'unknown');
  const diagnostic = JSON.parse(h.values.YOSAN_YOUTUBE_LAST_ERROR_V1);
  assert.equal(diagnostic.code, 'youtubeSignupRequired');
  h.context.diagnosePersonalYouTube();
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(h.calls.chats.length, 1);
  assert.ok(h.calls.console.join('\n').includes('前回のエラー段階'));
});

test('資格情報・メール・URLをエラー表示から除外する', () => {
  const h = harness();
  const failure = new Error('API call to youtube.liveChatMessages.insert failed with error: forbidden ' +
    'access_token=private-access client_secret=private-secret Bearer private-bearer ' +
    'AIzaPrivateApiKey123456789 abc@example.com https://example.com/?token=private-url ' + 'a'.repeat(100));
  const diagnostic = h.context.youtubeDiagnostic_(failure, 'チャット投稿API');
  for (const secret of ['private-access', 'private-secret', 'private-bearer', 'AIzaPrivateApiKey', 'abc@example.com', 'private-url', 'a'.repeat(100)]) {
    assert.ok(!diagnostic.detail.includes(secret), secret);
  }
  assert.equal(diagnostic.code, 'forbidden');
  assert.ok(!h.context.youtubeDiagnostic_(new Error('timeout private-key'), '配信取得').detail.includes('private-key'));
});

test('解析データ破損とYouTubeサービス未追加を別の段階・理由で診断する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const corrupt = personalWithPrepared(school, { properties: { YOSAN_STATE_V1: 'broken' } });
  const state = corrupt.context.postPreparedCommentToYouTube();
  assert.equal(state.stage, '解析済みデータの読込');
  assert.equal(state.code, 'BOT_STATE_INVALID');
  const missing = personalWithPrepared(school); delete missing.context.YouTube;
  const result = missing.context.diagnosePersonalYouTube();
  assert.equal(result.stage, '投稿用チャンネルの取得');
  assert.equal(result.code, 'YOUTUBE_SERVICE_MISSING');
});

test('個人側診断もスクリプトロックとAPI予算を守る', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const busy = personalWithPrepared(school, { busy: true });
  assert.equal(busy.context.diagnosePersonalYouTube().status, 'busy');
  assert.equal(busy.calls.channels, 0);
  const limited = personalWithPrepared(school, { properties: { YOUTUBE_DAILY_UNIT_BUDGET: '1' } });
  const result = limited.context.diagnosePersonalYouTube();
  assert.equal(result.code, 'BOT_WAIT');
  assert.equal(limited.calls.chats.length, 0);
});

const VARIATION_PROPERTIES = { ENABLE_FEELING_VARIATION: 'true', GEMINI_DAILY_REQUEST_BUDGET: '24', YOUTUBE_MIN_INTERVAL_MINUTES: '60' };

test('1時間移行は認証情報・投稿状態・消費済み割当を維持する', () => {
  const h = preparedSchool();
  h.context.analyzeLatestImageAndLog();
  const before = { state: h.values.YOSAN_STATE_V1, limits: h.values.YOSAN_LIMITS_V1, key: h.values.GEMINI_API_KEY };
  h.context.configureHourlyCommentary();
  assert.equal(h.values.ENABLE_FEELING_VARIATION, 'true');
  assert.equal(h.values.GEMINI_DAILY_REQUEST_BUDGET, '24');
  assert.equal(h.values.YOUTUBE_MIN_INTERVAL_MINUTES, '60');
  assert.equal(h.values.YOSAN_STATE_V1, before.state);
  assert.equal(h.values.YOSAN_LIMITS_V1, before.limits);
  assert.equal(h.values.GEMINI_API_KEY, before.key);
});

test('学校と個人の自動実行はそれぞれ1時間で作成する', () => {
  const school = preparedSchool({ allowedScopes: [...SCHOOL_SCOPES, 'https://www.googleapis.com/auth/script.scriptapp'] });
  school.context.installSchoolAnalysisTrigger();
  assert.deepEqual(school.calls.triggerIntervals, [{ handler: 'analyzeLatestImageAndLog', hours: 1 }]);
  const personal = personalWithPrepared(school, { allowedScopes: [...PERSONAL_SCOPES, 'https://www.googleapis.com/auth/script.scriptapp'] });
  personal.context.installPersonalYouTubeTrigger();
  assert.deepEqual(personal.calls.triggerIntervals, [{ handler: 'postPreparedCommentToYouTube', hours: 1 }]);
});

test('同じ写真でも1時間後に新しい実況を解析・記録して個人側から1回だけ投稿する', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES, geminiResponses: [
    geminiResponse('ぼく、ここが特等席で落ち着くな。'),
    geminiResponse('ぼく、この葉っぱの模様が気になってわくわくするよ。')
  ] });
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  const first = school.state();
  const personal = personalWithPrepared(school);
  assert.equal(personal.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  assert.equal(personal.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'waiting_fresh_analysis');
  Object.assign(school.values, { YOSAN_STATE_V1: personal.values.YOSAN_STATE_V1, YOSAN_LIMITS_V1: personal.values.YOSAN_LIMITS_V1 });
  school.advance(3600000);
  assert.equal(school.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'prepared');
  const second = school.state();
  assert.equal(second.key, first.key);
  assert.ok(second.analysisKey !== first.analysisKey);
  assert.ok(second.feeling !== first.feeling);
  assert.equal(school.calls.gemini.length, 2);
  assert.equal(school.calls.logs.length, 2);
  assert.ok(school.calls.logs[0][3] !== school.calls.logs[1][3]);
  assert.ok(school.calls.logs[0][0] !== school.calls.logs[1][0]);
  const payload = JSON.parse(school.calls.gemini[1].request.payload);
  assert.ok(payload.contents[0].parts[0].text.includes(first.feeling));
  assert.ok(payload.contents[0].parts[0].text.includes('問いかけ') || payload.contents[0].parts[0].text.includes('ユーモア'));
  personal.advance(3600000);
  Object.assign(personal.values, { YOSAN_STATE_V1: school.values.YOSAN_STATE_V1, YOSAN_LIMITS_V1: school.values.YOSAN_LIMITS_V1 });
  assert.equal(personal.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  personal.advance(3600000);
  assert.equal(personal.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'waiting_fresh_analysis');
  assert.equal(personal.calls.chats.length, 2);
  assert.ok(personal.calls.chats[0].payload.snippet.textMessageDetails.messageText !== personal.calls.chats[1].payload.snippet.textMessageDetails.messageText);
  assert.equal(personal.calls.gemini.length, 0);
  assert.equal(personal.calls.logs.length, 0);
});

test('完全一致・ほぼ同じ語句の実況は追加API呼出しなしで見送る', () => {
  const original = 'ぼく、ここが特等席で落ち着くな。';
  const school = preparedSchool({ properties: VARIATION_PROPERTIES, geminiResponses: [
    geminiResponse(original), geminiResponse(original + '！'), geminiResponse('ぼく、ここも特等席で落ち着くな。')
  ] });
  school.context.analyzeLatestImageAndLog();
  const state = school.values.YOSAN_STATE_V1;
  for (let i = 0; i < 2; i++) {
    school.advance(3600000);
    assert.equal(school.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'duplicate_comment');
    assert.equal(school.values.YOSAN_STATE_V1, state);
    assert.equal(school.calls.gemini.length, i + 2);
  }
  assert.equal(school.calls.logs.length, 1);
});

test('実況履歴は直近8件を保持し比較時は表記・記号を正規化する', () => {
  const h = preparedSchool({ properties: VARIATION_PROPERTIES });
  let history = [];
  for (let i = 0; i < 12; i++) {
    h.context.rememberFeeling_('実況' + i, history);
    history = JSON.parse(h.values.YOSAN_FEELING_HISTORY_V1).texts;
  }
  assert.equal(history.length, 8);
  assert.equal(history[0], '実況4');
  assert.ok(h.context.similarFeelings_('ＡＢＣ ほっと一息。💭', 'abcほっと一息！'));
  assert.equal(h.context.similarFeelings_('みんな集合', '葉っぱの模様'), false);
});

test('既存の解析文と最後の投稿文も初回の比較履歴に含める', () => {
  const h = preparedSchool();
  h.context.analyzeLatestImageAndLog();
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1);
  limits.youtube.lastText = '配信を見守ってくれてありがとう。';
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
  const history = h.context.recentFeelings_();
  assert.ok(history.includes(h.state().feeling));
  assert.ok(history.includes(limits.youtube.lastText));
});

test('履歴破損はAPIを呼ばず停止し履歴を削除しない', () => {
  const school = preparedSchool({ properties: { ...VARIATION_PROPERTIES, YOSAN_FEELING_HISTORY_V1: '{"texts":[123]}' } });
  assert.throws(() => school.context.analyzeLatestImageAndLog(), /実況文の履歴/);
  assert.equal(school.calls.gemini.length, 0);
  assert.equal(school.values.YOSAN_FEELING_HISTORY_V1, '{"texts":[123]}');
});

test('学校の記録失敗時は生成済み実況を使い再解析せず履歴を完了する', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES, logFailures: 1 });
  assert.throws(() => school.context.analyzeLatestImageAndLog(), /sheet write failure/);
  const feeling = school.state().feeling;
  school.advance(3600000);
  assert.equal(school.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'prepared');
  assert.equal(school.calls.gemini.length, 1);
  assert.equal(school.state().feeling, feeling);
  assert.equal(school.calls.logs.length, 1);
});

test('変化モードでも解析プレビューから初回の本番解析を再利用する', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES });
  school.context.previewSchoolAnalysis();
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(school.calls.gemini.length, 1);
  assert.equal(school.calls.logs.length, 1);
});

test('投稿結果不明は写真が変わっても学校側の解析で解除しない', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const state = school.state(); state.youtube = 'unknown';
  school.values.YOSAN_STATE_V1 = JSON.stringify(state);
  school.advance(3600000); school.refreshImage();
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'unknown');
  assert.equal(school.calls.gemini.length, 1);
  assert.equal(school.state().youtube, 'unknown');
  assert.equal(school.run().status, 'unknown');
});

test('新しい画像でも最後の投稿と似た準備済み文は個人側で投稿しない', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const personal = personalWithPrepared(school);
  assert.equal(personal.context.postPreparedCommentToYouTube().youtube, 'sent');
  const state = personal.state(); state.youtube = 'pending'; state.key = 'new-photo';
  state.feeling += '！'; personal.values.YOSAN_STATE_V1 = JSON.stringify(state);
  personal.advance(3600000);
  assert.equal(personal.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'waiting_fresh_analysis');
  assert.equal(personal.calls.chats.length, 1);
});

test('新しい実況でも手動投稿は60分間隔を守る', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const personal = personalWithPrepared(school);
  assert.equal(personal.context.postPreparedCommentToYouTube().youtube, 'sent');
  const state = personal.state(); state.youtube = 'pending'; state.feeling = 'ぼく、みんなと一緒にのんびり過ごしたいな。';
  personal.values.YOSAN_STATE_V1 = JSON.stringify(state);
  personal.advance(59 * 60000);
  assert.equal(personal.context.postPreparedCommentToYouTube().status, 'rate_limited');
  assert.equal(personal.calls.chats.length, 1);
  personal.advance(60000);
  assert.equal(personal.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(personal.calls.chats.length, 2);
});

test('生成を更新しても1日予算に達したら解析と再投稿を増やさない', () => {
  const school = preparedSchool({ properties: { ...VARIATION_PROPERTIES, GEMINI_DAILY_REQUEST_BUDGET: '1' } });
  school.context.analyzeLatestImageAndLog({ triggerUid: 'school' });
  school.advance(60000);
  assert.equal(school.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'rate_limited');
  assert.equal(school.calls.gemini.length, 1);
  assert.equal(school.calls.logs.length, 1);
});

test('YouTube応答後に最後の投稿文を保存できなければunknownとして再送を止める', () => {
  const school = preparedSchool({ properties: VARIATION_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const personal = personalWithPrepared(school, { failPropertyWrite: (name, value) => name === 'YOSAN_LIMITS_V1' && value.includes('"lastText"') });
  assert.equal(personal.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(personal.state().youtube, 'unknown');
  personal.advance(3600000);
  assert.equal(personal.context.postPreparedCommentToYouTube().status, 'unknown');
  assert.equal(personal.calls.chats.length, 1);
});

const NAMED_PROPERTIES = { ENABLE_NAMED_COMMENTS: 'true' };

test('名前付き設定は50個の名前を用意しキー・状態・予算・順番を維持する', () => {
  const h = preparedSchool();
  h.context.analyzeLatestImageAndLog();
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1); limits.youtube.nameSequence = 12;
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
  const before = { state: h.values.YOSAN_STATE_V1, limits: h.values.YOSAN_LIMITS_V1, key: h.values.GEMINI_API_KEY };
  h.context.configureNamedCommentary();
  const names = JSON.parse(h.values.SILKWORM_NAMES);
  assert.equal(h.values.ENABLE_NAMED_COMMENTS, 'true');
  assert.equal(names.length, 50);
  assert.equal(new Set(names).size, 50);
  assert.equal(h.values.YOSAN_STATE_V1, before.state);
  assert.equal(h.values.YOSAN_LIMITS_V1, before.limits);
  assert.equal(h.values.GEMINI_API_KEY, before.key);
  assert.equal(h.values.YOUTUBE_MIN_INTERVAL_MINUTES, '10');
});

test('名前付き設定の再実行は自分の名簿を上書きしない', () => {
  const h = preparedSchool({ properties: { SILKWORM_NAMES: '["こはる","まめ"]' } });
  h.context.configureNamedCommentary();
  h.context.configureNamedCommentary();
  assert.equal(h.values.SILKWORM_NAMES, '["こはる","まめ"]');
});

test('名前の設定はJSON配列・個数・長さ・改行・重複を検証する', () => {
  const h = preparedSchool();
  for (const raw of ['invalid', '{}', '[]', '[null]', '[""]', '["a","Ａ"]', '["こはく"," こはく "]',
    JSON.stringify(['a'.repeat(13)]), JSON.stringify(['こはく\nまゆ']), JSON.stringify(['こはく\u2028まゆ']),
    JSON.stringify(Array.from({ length: 101 }, (_, i) => 'まゆ' + i))]) {
    assert.throws(() => h.context.parseSilkwormNames_(raw), /SILKWORM_NAMES/);
  }
  assert.deepEqual(Array.from(h.context.parseSilkwormNames_('[" こはく ","🐛"]')), ['こはく', '🐛']);
  assert.equal(h.context.parseSilkwormNames_(JSON.stringify(['🐛'.repeat(12)])).length, 1);
});

test('不正な名前の設定では投稿や解析APIを呼ばない', () => {
  const h = preparedSchool({ properties: { ...NAMED_PROPERTIES, SILKWORM_NAMES: '[""]' } });
  assert.throws(() => h.context.analyzeLatestImageAndLog(), /SILKWORM_NAMES/);
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.chats.length, 0);
});

test('個人側の投稿文プレビューは外部サービス・スコープ要求・状態保存を行わない', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: Date.parse('2026-11-04T15:30:00Z') });
  delete h.context.YouTube;
  const before = JSON.stringify(h.values);
  const preview = h.context.previewPreparedComment();
  assert.equal(preview.name, 'こはく');
  assert.equal(preview.date, '2026/11/05');
  assert.equal(preview.messageText, '2026/11/05 00:30\nこはく：' + school.state().feeling);
  assert.equal(h.context.previewPreparedComment().messageText, preview.messageText);
  assert.equal(JSON.stringify(h.values), before);
  assert.equal(h.calls.scopes.length, 0);
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.videos.length, 0);
});

test('投稿文プレビューは解析済みデータがなければ待機する', () => {
  const h = preparedSchool({ properties: NAMED_PROPERTIES });
  assert.equal(h.context.previewPreparedComment().status, 'waiting_analysis');
  assert.equal(h.calls.gemini.length, 0);
});

test('個人側は投稿日の日本時間・最初の名前・準備済み本文を送る', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES, now: Date.parse('2026-11-04T15:30:00Z'),
    files: [{ updated: Date.parse('2020-01-01T00:00:00Z') }] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: school.now() });
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  const message = h.calls.chats[0].payload.snippet.textMessageDetails.messageText;
  assert.equal(message, '2026/11/05 00:30\nこはく：' + school.state().feeling);
  assert.equal(h.state().youtubeComment.text, message);
  assert.equal(h.state().youtubeComment.name, 'こはく');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 1);
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.logs.length, 0);
});

test('日付はプレビュー日でなく実際に送る日の日本時間で組み立てる', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: Date.parse('2026-11-04T14:59:59Z') });
  assert.equal(h.context.previewPreparedComment().date, '2026/11/04');
  assert.equal(h.context.previewPreparedComment().dateTime, '2026/11/04 23:59');
  h.advance(2000);
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.state().youtubeComment.date, '2026/11/05');
  assert.equal(h.state().youtubeComment.dateTime, '2026/11/05 00:00');
  assert.equal(h.state().youtubeComment.name, 'こはく');
});

test('50個の名前は成功ごとに順番を進め日付をまたいでも続きから一周する', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: Date.parse('2026-11-05T12:00:00Z') });
  const used = [];
  for (let i = 0; i < 51; i++) {
    assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
    used.push(h.state().youtubeComment.name);
    h.advance(3600000);
  }
  assert.equal(new Set(used.slice(0, 50)).size, 50);
  assert.equal(used[0], 'こはく');
  assert.equal(used[1], 'まゆ');
  assert.equal(used[49], 'りん');
  assert.equal(used[50], 'こはく');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 51);
  assert.equal(h.calls.gemini.length, 0);
});

test('名簿を変更した場合は保存済みの順番を新しい名簿に適用する', () => {
  const school = preparedSchool({ properties: { ...NAMED_PROPERTIES, SILKWORM_NAMES: '["こはる","まめ"]' } });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const used = [];
  for (let i = 0; i < 3; i++) {
    h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
    used.push(h.state().youtubeComment.name);
    h.advance(3600000);
  }
  assert.deepEqual(used, ['こはる', 'まめ', 'こはる']);
});

test('名前を変えても同じ本文の再投稿を防ぐ', () => {
  const school = preparedSchool({ properties: { ...VARIATION_PROPERTIES, ...NAMED_PROPERTIES } });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  h.context.postPreparedCommentToYouTube();
  h.advance(3600000);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'waiting_fresh_analysis');
  const state = h.state(); state.youtube = 'pending'; h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'waiting_fresh_analysis');
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1);
  assert.equal(limits.youtube.nameSequence, 1);
  assert.equal(limits.youtube.lastText, school.state().feeling);
  assert.equal(h.calls.chats.length, 1);
});

test('学校が新しい本文を用意したら次の名前で投稿しGeminiを追加で呼ばない', () => {
  const school = preparedSchool({ properties: { ...VARIATION_PROPERTIES, ...NAMED_PROPERTIES }, geminiResponses: [
    geminiResponse('白い体が並んで、ここがぼくの特等席。'),
    geminiResponse('ぼく、この葉っぱの模様が気になってわくわくするよ。')
  ] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' });
  school.values.YOSAN_STATE_V1 = h.values.YOSAN_STATE_V1;
  school.values.YOSAN_LIMITS_V1 = h.values.YOSAN_LIMITS_V1;
  school.advance(3600000); h.advance(3600000);
  assert.equal(school.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'prepared');
  h.values.YOSAN_STATE_V1 = school.values.YOSAN_STATE_V1;
  h.values.YOSAN_LIMITS_V1 = school.values.YOSAN_LIMITS_V1;
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  assert.equal(h.state().youtubeComment.name, 'まゆ');
  assert.equal(school.calls.gemini.length, 2);
  assert.equal(school.calls.logs.length, 2);
  assert.equal(h.calls.gemini.length, 0);
});

test('APIの応答が不明なら名前の順番を進めず写真が変わっても再送しない', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { chatFailure: new Error('network disconnected') });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(h.state().youtubeComment.name, 'こはく');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
  h.advance(3600000);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'unknown');
  school.values.YOSAN_STATE_V1 = h.values.YOSAN_STATE_V1;
  school.advance(3600000); school.refreshImage();
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'unknown');
  assert.equal(h.calls.chats.length, 1);
});

test('明確な投稿拒否では同じ順番を維持して次の成功で進める', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES }); school.context.analyzeLatestImageAndLog();
  const rejected = new Error('rejected'); rejected.definitelyRejected = true;
  const h = personalWithPrepared(school, { chatFailure: rejected });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.state().youtube, 'pending');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
  h.context.YouTube.LiveChatMessages.insert = (payload, part) => {
    h.calls.chats.push({ payload: clone(payload), part }); return { id: 'message-2' };
  };
  h.advance(3600000);
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.state().youtubeComment.name, 'こはく');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 1);
});

test('予算待ちは名前を消費せず次の投稿で同じ名前を使う', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES }); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { properties: { YOUTUBE_DAILY_UNIT_BUDGET: '49' } });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'rate_limited');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
  h.values.YOUTUBE_DAILY_UNIT_BUDGET = '8000';
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.state().youtubeComment.name, 'こはく');
});

test('送信前の状態保存に失敗したら名前付きの投稿を始めない', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES }); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { failPropertyWrite: (name, value) => name === 'YOSAN_STATE_V1' && value.includes('"youtube":"sending"') });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
});

test('API成功後に名前の順番を保存できなければunknownにして再送しない', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES }); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { failPropertyWrite: (name, value) => name === 'YOSAN_LIMITS_V1' && value.includes('"nameSequence"') });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.state().youtube, 'unknown');
  h.advance(3600000);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'unknown');
  assert.equal(h.calls.chats.length, 1);
});

test('成功応答後の状態保存失敗でも確認済みの名前の順番は残る', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES }); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { failPropertyWrite: (name, value) => name === 'YOSAN_STATE_V1' && value.includes('"youtube":"sent"') });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 1);
  assert.equal(h.calls.chats.length, 1);
});

test('名前の順番が不正ならAPIを呼ばず停止する', () => {
  const school = preparedSchool({ properties: NAMED_PROPERTIES }); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1); limits.youtube.nameSequence = -1;
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.videos.length, 0);
});

test('無効時は従来の見出しを維持し無効な名簿も参照しない', () => {
  const h = harness({ properties: { ENABLE_NAMED_COMMENTS: 'false', SILKWORM_NAMES: 'invalid' } });
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.calls.chats[0].payload.snippet.textMessageDetails.messageText,
    '【今の蚕の気持ち💭】\n' + h.state().feeling);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
});

test('一括処理でも日付と名前を付け状態に保存する', () => {
  const h = harness({ now: Date.parse('2026-11-04T15:00:00Z'), properties: NAMED_PROPERTIES });
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.state().youtubeComment.date, '2026/11/05');
  assert.equal(h.state().youtubeComment.name, 'こはく');
  assert.equal(h.calls.gemini.length, 1);
});

const CARE_PROPERTIES = { ...VARIATION_PROPERTIES, ENABLE_NAMED_COMMENTS: 'true', ENABLE_REARING_CONTEXT: 'true' };
const careResponse = (feeling = '葉っぱのそばが、ぼくの特等席。', ui = {}) => geminiResponse(JSON.stringify({
  stageText: '1令3日目', temperatureText: '28℃', humidityText: '79%', cleaningStatusText: null, coinReferenceText: null, feeling, ...ui
}));

test('飼育環境読取りは初期有効で同じ1回のAPIからUIと気持ちを得る', () => {
  const h = preparedSchool({ properties: { ENABLE_REARING_CONTEXT: undefined }, geminiResponses: [careResponse()] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  const request = JSON.parse(h.calls.gemini[0].request.payload);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.equal(request.generationConfig.maxOutputTokens, 512);
  assert.ok(request.generationConfig.responseJsonSchema.required.includes('stageText'));
  assert.ok(request.systemInstruction.parts[0].text.includes('1令29℃'));
  assert.ok(request.systemInstruction.parts[0].text.includes('設定値や目安値と混同しない'));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.state().rearing.instar, 1);
  assert.equal(h.state().rearing.instarDay, 3);
  assert.equal(h.state().rearing.temperatureC, 28);
  assert.equal(h.state().rearing.humidityPercent, 79);
  assert.equal(h.state().rearing.reference.temperatureC, 29);
  assert.equal(h.state().rearing.reference.humidityPercent, 75);
  assert.equal(h.state().analysisVersion, 'rearing-scale-v4');
});

test('1から5令の温度目安はUIの令に対応し4令の湿度を補わない', () => {
  const h = preparedSchool();
  for (let instar = 1; instar <= 5; instar++) {
    const result = h.context.parseRearingResponse_(JSON.stringify({
      stageText: instar + '令2日目', temperatureText: '28℃', humidityText: '79%', feeling: 'ぼくのペースでいこうかな。'
    }));
    assert.equal(result.observation.reference.temperatureC, 30 - instar);
    assert.equal(result.observation.reference.humidityPercent, instar === 4 ? null : 75);
    assert.equal(result.observation.instarDay, 2);
  }
});

test('1から3令の27から29℃で暑いとする本文を見送る', () => {
  for (const [instar, temperature] of [[1, 29], [2, 28], [3, 27]]) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
      careResponse('暑くてたまらないなあ。', { stageText: instar + '令3日目', temperatureText: temperature + '℃' })
    ] });
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'care_mismatch');
    assert.equal(h.calls.logs.length, 0);
    assert.equal(h.values.YOSAN_STATE_V1, undefined);
    assert.equal(h.calls.gemini.length, 1);
    assert.ok(h.calls.console.some(line => line.includes('画像UIの読取り:')));
  }
});

test('目安に近い湿度でジメジメや湿っぽいとする本文を見送る', () => {
  for (const feeling of ['湿っぽくて体が重いなあ。', '湿度79%でジメジメするよ。', '湿度が高くてつらいな。']) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(feeling)] });
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'care_mismatch');
    assert.equal(h.calls.gemini.length, 1);
    assert.equal(h.calls.logs.length, 0);
  }
});

test('温度と湿度が近い目安から少し違っても捏造せず中立の気持ちを準備する', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('ぼく、1令3日目は葉っぱのそばでひと休み気分。')
  ] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.state().rearing.temperatureC, 28);
  assert.equal(h.state().rearing.humidityPercent, 79);
  assert.equal(h.state().feeling, 'ぼく、1令3日目は葉っぱのそばでひと休み気分。');
  assert.equal(h.calls.logs.length, 1);
});

test('危険域の温度を快適とする本文は見送り高温への心配は許容する', () => {
  const bad = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('35℃で快適だな。', { temperatureText: '35℃' })
  ] });
  assert.equal(bad.context.analyzeLatestImageAndLog().status, 'care_mismatch');
  const good = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('ぼく、35℃の暑さが心配だな。', { temperatureText: '35℃' })
  ] });
  assert.equal(good.context.analyzeLatestImageAndLog().status, 'prepared');
});

test('目安の範囲が不明な段階では快適と断定せず知らない日数も補わない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('今日は快適な温度だよ。', { stageText: null })
  ] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'care_mismatch');
  const neutral = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('ぼく、ここでのんびり過ごしたい気分。', { stageText: null, temperatureText: null, humidityText: null })
  ] });
  assert.equal(neutral.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(neutral.state().rearing.instar, null);
  assert.equal(neutral.state().rearing.reference.temperatureC, null);
});

test('孵化後の日数だけから令を計算せずUIの令を優先する', () => {
  const h = preparedSchool();
  const total = h.context.parseRearingResponse_(JSON.stringify({
    stageText: '孵化後：9日目', temperatureText: '28℃', humidityText: '79%', feeling: '9日目、のんびり気分。'
  }));
  assert.equal(total.observation.instar, null);
  assert.equal(total.observation.hatchDay, 9);
  assert.equal(total.observation.reference.temperatureC, null);
  h.context.validateRearingFeeling_(total.feeling, total.observation);
  assert.throws(() => h.context.validateRearingFeeling_('3令になったぼくだよ。', total.observation), e => e.botStatus === 'care_mismatch');
  const explicit = h.context.parseRearingResponse_(JSON.stringify({
    stageText: '2令1日目 孵化後9日目', temperatureText: '28℃', humidityText: '79%', feeling: 'のんびり気分。'
  }));
  assert.equal(explicit.observation.instar, 2);
  assert.equal(explicit.observation.instarDay, 1);
  assert.equal(explicit.observation.hatchDay, 9);
});

test('全角や漢数字のUIを読み混在した令を一つに決めつけない', () => {
  const h = preparedSchool();
  const parse = stageText => h.context.parseRearingResponse_(JSON.stringify({
    stageText, temperatureText: '温度：２８．５℃', humidityText: '湿度：７９％', feeling: 'のんびり気分。'
  })).observation;
  const observation = parse('一齢 三日目');
  assert.equal(observation.instar, 1);
  assert.equal(observation.instarDay, 3);
  assert.equal(observation.temperatureC, 28.5);
  assert.equal(observation.humidityPercent, 79);
  assert.equal(parse('1令3日目・2令1日目').instar, null);
  assert.equal(parse('3令1日目 2眠明け').phase, 'larva');
});

test('眠中は食べている描写を見送り営繭中の目安は23℃60％に切り替わる', () => {
  const sleeping = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('もぐもぐ食べているよ。', { stageText: '3眠' })
  ] });
  assert.equal(sleeping.context.analyzeLatestImageAndLog().status, 'care_mismatch');
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('ぼく、繭の準備に集中したい気分。', { stageText: '5令8日目 営繭', temperatureText: '23℃', humidityText: '60%' })
  ] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.state().rearing.phase, 'spinning');
  assert.equal(h.state().rearing.reference.temperatureC, 23);
  assert.equal(h.state().rearing.reference.humidityPercent, 60);
});

test('写真から読み取れない数値と本文の食い違いを見送る', () => {
  for (const feeling of ['温度は30℃でいい気分。', '湿度は75%でのんびり。', '2令3日目のぼくだよ。', '1令4日目のぼくだよ。']) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(feeling)] });
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'care_mismatch');
  }
  const unknown = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('温度は28℃だよ。', { temperatureText: '27〜29℃' })
  ] });
  assert.equal(unknown.context.analyzeLatestImageAndLog().status, 'care_mismatch');
});

test('解析JSONが壊れている場合は本文だけを採用して投稿しない', () => {
  for (const text of ['快適だよ。', '{"feeling":"のんびり。"}', '[]']) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [geminiResponse(text)] });
    assert.throws(() => h.context.analyzeLatestImageAndLog(), /飼育環境/);
    assert.equal(h.calls.logs.length, 0);
    assert.equal(h.calls.gemini.length, 1);
  }
});

test('新解析形式では古いプレビューを再利用せず新しいUI情報を保存する', () => {
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, ENABLE_REARING_CONTEXT: 'false' }, geminiResponses: [
    geminiResponse('ぼく、暑くてつらいなあ。'), careResponse()
  ] });
  h.context.previewSchoolAnalysis();
  assert.equal(h.calls.gemini.length, 1);
  h.values.ENABLE_REARING_CONTEXT = 'true';
  h.advance(3600000);
  assert.equal(h.context.previewSchoolAnalysis().status, 'preview');
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(JSON.parse(h.values.YOSAN_PREVIEW_V1).analysisVersion, 'rearing-scale-v4');
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(h.state().rearing.instarDay, 3);
});

test('個人側は古い未検証の準備済み文を投稿せず学校の新解析を待つ', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { properties: { ENABLE_REARING_CONTEXT: 'true' } });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'waiting_analysis');
  assert.equal(h.context.previewPreparedComment().status, 'waiting_analysis');
  assert.equal(h.calls.videos.length, 0);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.gemini.length, 0);
});

test('日付と名前コロンの投稿形式でUIに基づく気持ちを共有し追加AI呼出しをしない', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-05T12:00:00Z'), properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: school.now() });
  assert.equal(h.context.previewPreparedComment().messageText, '2026/11/05 21:00\nこはく：葉っぱのそばが、ぼくの特等席。');
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.calls.chats[0].payload.snippet.textMessageDetails.messageText, '2026/11/05 21:00\nこはく：葉っぱのそばが、ぼくの特等席。');
  assert.equal(school.calls.gemini.length, 1);
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 1);
});

test('飼育目安への不一致でもAPI予算を消費し即時の再生成をしない', () => {
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, GEMINI_DAILY_REQUEST_BUDGET: '1' }, geminiResponses: [careResponse('暑いよ。')] });
  assert.equal(h.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'care_mismatch');
  h.advance(60000);
  assert.equal(h.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 1);
});

test('飼育目安の新版移行でもunknownの送信状態を解除しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const state = school.state(); state.youtube = 'unknown'; school.values.YOSAN_STATE_V1 = JSON.stringify(state);
  school.values.ENABLE_REARING_CONTEXT = 'true';
  school.advance(3600000); school.refreshImage();
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'unknown');
  assert.equal(school.calls.gemini.length, 1);
  const h = personalWithPrepared(school);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'unknown');
  assert.equal(h.calls.chats.length, 0);
});

test('気持ちの視点は12通りあり本文の話題を食事や温湿度だけにしない', () => {
  const h = preparedSchool();
  const prompts = [];
  for (let count = 0; count < 12; count++) {
    h.values.YOSAN_LIMITS_V1 = JSON.stringify({ gemini: { count } });
    prompts.push(h.context.variedFeelingPrompt_([]));
  }
  assert.equal(new Set(prompts).size, 12);
  assert.ok(prompts.some(text => text.includes('仲間')));
  assert.ok(prompts.some(text => text.includes('居場所')));
  assert.ok(prompts.some(text => text.includes('食事以外')));
});

test('一括処理の初期有効モードもUIを読み日付名前付き本文を1回で投稿する', () => {
  const h = harness({ properties: { ENABLE_REARING_CONTEXT: undefined, ENABLE_NAMED_COMMENTS: 'true' },
    geminiResponses: [careResponse()] });
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.state().analysisVersion, 'rearing-scale-v4');
  assert.equal(h.state().rearing.instar, 1);
  assert.equal(h.state().rearing.reference.temperatureC, 29);
  assert.ok(h.calls.chats[0].payload.snippet.textMessageDetails.messageText.includes('\nこはく：'));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.run().youtube, 'sent');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 1);
});

test('蚕本人の一人称と心の声は語順や呼び方を変えて採用できる', () => {
  const h = preparedSchool();
  for (const text of [
    '葉っぱのそばなら、ぼくものんびりできるな。',
    'わたし、みんなと一緒でちょっとうれしいな。',
    '僕はここがお気に入りだよ。',
    '私もちょっとひと休みしたいな。',
    'ぼくら、仲間といっしょで安心するよ。',
    'ボク、次のごはんが楽しみだな。',
    'ぼく、今日はなんだかむずむず。'
  ]) h.context.validateSilkwormVoice_(text);
});

test('観察者やAIの解説は一人称を付けただけでも見送る', () => {
  const h = preparedSchool();
  for (const text of [
    '蚕たちは元気に育っています。',
    '葉っぱの上でみんなが食べているように見えます。',
    'ぼく、蚕たちが元気そうでうれしいな。',
    'ぼくは観察者として蚕の様子を伝えたいな。',
    'わたしはAIとして蚕の気持ちを解説したいな。',
    '「ぼくはうれしい」と蚕が言っています。',
    'ぼく、温度28℃、湿度79%だよ。',
    'ぼく、温度28℃、湿度79%だな。'
  ]) assert.throws(() => h.context.validateSilkwormVoice_(text), e => e.botStatus === 'voice_mismatch');
});

test('観察者目線のAI回答は投稿とシート保存をせず履歴にも採用しない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('蚕たちは元気に育っています。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'voice_mismatch');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, undefined);
  assert.equal(h.values.YOSAN_FEELING_HISTORY_V1, undefined);
  const prompt = JSON.parse(h.calls.gemini[0].request.payload).systemInstruction.parts[0].text;
  assert.ok(prompt.includes('一人称'));
  assert.ok(prompt.includes('本人の好み'));
  assert.ok(prompt.includes('観察者・解説者'));
});

test('旧互換モードでも一人称でない回答を投稿しない', () => {
  const h = harness({ geminiResponses: [geminiResponse('蚕は元気そうですね。')] });
  assert.equal(h.run().status, 'voice_mismatch');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.calls.uploads.length, 0);
});

test('本人の気持ちを日付と名前コロンで投稿する', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-05T12:00:00Z'), properties: CARE_PROPERTIES,
    geminiResponses: [careResponse('葉っぱのそばなら、ぼくものんびりできるな。')] });
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  const h = personalWithPrepared(school, { now: school.now() });
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.calls.chats[0].payload.snippet.textMessageDetails.messageText,
    '2026/11/05 21:00\nこはく：葉っぱのそばなら、ぼくものんびりできるな。');
});

test('個人側は保存済み本文を変更された場合も観察者文を送信しない', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const state = h.state(); state.feeling = '蚕たちは元気に食べています。';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'voice_mismatch');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.state().youtube, 'pending');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
});

test('直接の投稿関数でも観察者文をAPI呼出し前に止める', () => {
  const h = harness();
  assert.throws(() => h.context.postLatestCommentToYouTube('蚕たちは元気です。', 'chat-1', h.context.getConfig_()),
    e => e.botStatus === 'voice_mismatch');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.values.YOSAN_LIMITS_V1, undefined);
});

test('不適合な本文の表示プレビューも状態を変えず待機する', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school); delete h.context.YouTube;
  const state = h.state(); state.feeling = '画面では蚕が食べています。';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  const before = JSON.stringify(h.values);
  assert.equal(h.context.previewPreparedComment().status, 'voice_mismatch');
  assert.equal(JSON.stringify(h.values), before);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.gemini.length, 0);
});

test('一人称検査前の旧解析文は投稿せず新しい学校側の解析を待つ', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const state = h.state(); state.feeling = '蚕たちは元気です。'; state.analysisVersion = 'rearing-v1';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'waiting_analysis');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.videos.length, 0);
});

test('気持ちを表せない画像の空本文は観察報告に置き換えず見送る', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('', {
    stageText: null, temperatureText: null, humidityText: null
  })] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'voice_mismatch');
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.calls.gemini.length, 1);
});

test('70文字への切詰めで一人称と気持ちが消えた文は採用しない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('葉'.repeat(75) + 'ぼくはのんびり気分。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'voice_mismatch');
  assert.equal(h.calls.logs.length, 0);
});

test('旧互換モードの一人称版への移行でもunknownを解除せず新旧画像とも待機する', () => {
  const h = harness(); h.run();
  const state = h.state(); state.youtube = 'unknown'; state.analysisVersion = 'before-first-person';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  h.advance(3600000);
  assert.equal(h.run().status, 'unknown');
  h.refreshImage();
  assert.equal(h.run().status, 'unknown');
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.chats.length, 1);
});

test('一人称が省略された明らかな心の声だけを補い同じ1回のAI応答で準備する', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-06T05:30:00Z'), properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('葉っぱのそばでのんびりしたいな。', { stageText: '2齢（5日目）', temperatureText: '26.0 ℃', humidityText: '84.5 %' })
  ] });
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(school.state().feeling, 'ぼく、葉っぱのそばでのんびりしたいな。');
  assert.equal(school.state().rearing.instar, 2);
  assert.equal(school.calls.gemini.length, 1);
  assert.ok(school.calls.console.some(line => line.includes('一人称を補いました:')));
  const h = personalWithPrepared(school, { now: school.now() });
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.calls.chats[0].payload.snippet.textMessageDetails.messageText,
    '2026/11/06 14:30\nこはく：ぼく、葉っぱのそばでのんびりしたいな。');
  assert.equal(h.calls.gemini.length, 0);
});

test('観察者文や数字だけの文は一人称を機械的に付けて通さない', () => {
  const h = preparedSchool();
  for (const [text, reason] of [
    ['蚕たちは元気そうですね。', 'observer_language'],
    ['のんびり楽しそうだね。', 'observer_language'],
    ['温度26℃、湿度84.5%です。', 'missing_feeling'],
    ['仲間が元気で安心だな。', 'ambiguous_subject']
  ]) assert.throws(() => h.context.normalizeSilkwormFeeling_(text), e => e.botStatus === 'voice_mismatch' && e.voiceReason === reason);
});

test('不採用ログには原因コードと候補文が残り投稿状態は作らない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('蚕たちは元気そうですね。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'voice_mismatch');
  const detail = h.calls.console.find(line => line.includes('一人称チェック不採用 [observer_language]'));
  assert.ok(detail);
  assert.ok(detail.includes('蚕たちは元気そうですね。'));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, undefined);
});

test('本人の感覚と別の自然な一人称も受け入れる', () => {
  const h = preparedSchool();
  for (const text of ['ぼく、おなかすいたな。', 'おいら、次のごはんが楽しみだよ。', 'あたし、ここが好き。', 'ぼく、まぶしいな。']) {
    assert.equal(h.context.normalizeSilkwormFeeling_(text), text);
  }
});

test('一人称の補完で文字数を超える場合は文を壊さず見送る', () => {
  const h = preparedSchool();
  assert.throws(() => h.context.normalizeSilkwormFeeling_('葉'.repeat(64) + 'が好きだな。'),
    e => e.voiceReason === 'prefix_too_long');
  const short = h.context.normalizeSilkwormFeeling_('葉'.repeat(60) + 'が好きだな。');
  assert.ok(Array.from(short).length <= 70);
  assert.ok(short.startsWith('ぼく、'));
});

test('更新した分担設定は登録済み動画IDを維持する', () => {
  const h = harness({ properties: { YOUTUBE_VIDEO_ID: 'new_video01' } });
  h.context.configureSplitAccountMode();
  assert.equal(h.values.YOUTUBE_VIDEO_ID, 'new_video01');
});

test('指定動画の不一致理由は追加APIなしで配信終了等を区別する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const cases = [
    [undefined, '動画を取得できません'],
    [null, 'ライブ配信情報なし'],
    [{ scheduledStartTime: '2030-01-01T00:00:00Z' }, '配信開始を確認できません'],
    [{ actualStartTime: '2026-11-06T00:00:00Z', actualEndTime: '2026-11-06T01:00:00Z' }, '配信終了済み'],
    [{ actualStartTime: '2026-11-06T00:00:00Z' }, '配信開始済み・チャットIDなし']
  ];
  for (const [details, expected] of cases) {
    const h = personalWithPrepared(school);
    h.setVideos(details === undefined ? [] : [h.liveVideo({ id: 'J1XMapSSHeI', liveStreamingDetails: details })]);
    assert.equal(h.context.previewYouTubeConnection().status, 'no_live');
    assert.ok(h.calls.console.some(line => line.includes(expected)));
    assert.equal(h.calls.videos.length, 1);
    assert.equal(h.calls.channels, 0);
    assert.equal(h.calls.searches.length, 0);
    assert.equal(h.calls.chats.length, 0);
  }
});

test('接続済みの表示も読取りAPI1回だけで投稿しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const before = h.values.YOSAN_STATE_V1;
  assert.equal(h.context.previewYouTubeConnection().status, 'ready');
  assert.ok(h.calls.console.some(line => line.includes('配信中・チャットID取得済み')));
  assert.equal(h.calls.videos.length, 1);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, before);
});

test('個人側診断で確認中の動画IDを表示するが投稿先を変更しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { properties: { YOUTUBE_VIDEO_ID: 'new_video01' } });
  h.setVideos([h.liveVideo({ id: 'new_video01' })]);
  assert.equal(h.context.diagnosePersonalYouTube().status, 'diagnosed');
  assert.ok(h.calls.console.some(line => line.includes('投稿先の指定: YOUTUBE_VIDEO_ID=new_video01')));
  assert.equal(h.values.YOUTUBE_VIDEO_ID, 'new_video01');
  assert.equal(h.calls.videos.length, 1);
  assert.equal(h.calls.channels, 1);
  assert.equal(h.calls.chats.length, 0);
});

test('自動検出設定は古い固定IDだけを解除し予算とunknownを維持する', () => {
  const state = JSON.stringify({ youtube: 'unknown', feeling: 'ぼく、のんびり気分。', logged: true });
  const limits = JSON.stringify({ youtube: { units: 700, nameSequence: 12, cooldownUntil: Date.now() + 100000 } });
  const searchKey = 'YOSAN_LAST_SEARCH_' + CHANNEL;
  const cacheKey = 'YOSAN_LIVE_VIDEO_' + CHANNEL;
  const h = harness({ properties: { CHANNEL_ID: CHANNEL, YOUTUBE_VIDEO_ID: 'old_video01',
    YOSAN_STATE_V1: state, YOSAN_LIMITS_V1: limits, YOSAN_FEELING_HISTORY_V1: '["ぼく、ここが好き。"]',
    [searchKey]: '123456789', [cacheKey]: 'cached-live' },
    triggers: ['analyzeLatestImageAndLog', 'postPreparedCommentToYouTube'] });
  const before = { ...h.values };
  const result = h.context.configureAutoYouTubeLive();
  assert.equal(result.mode, 'auto');
  assert.equal(result.channelId, CHANNEL);
  assert.equal(h.values.YOUTUBE_VIDEO_ID, undefined);
  for (const key of Object.keys(before).filter(key => key !== 'YOUTUBE_VIDEO_ID')) assert.equal(h.values[key], before[key], key);
  assert.equal(h.triggers.length, 2);
  assert.equal(h.calls.channels, 0);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.gemini.length, 0);
});

test('自動検出設定はキー不要で既定チャンネルを登録し不正チャンネルでは変更しない', () => {
  const h = harness({ properties: { GEMINI_API_KEY: undefined, YOUTUBE_VIDEO_ID: '古いURLでも解除できる' } });
  h.context.configureAutoYouTubeLive();
  assert.equal(h.values.CHANNEL_ID, CHANNEL);
  assert.equal(h.context.getYouTubeOnlyConfig_().videoId, '');
  assert.equal(h.context.getYouTubeOnlyConfig_().channelId, CHANNEL);
  const invalid = harness({ properties: { CHANNEL_ID: 'https://www.youtube.com/@example', YOUTUBE_VIDEO_ID: 'old_video01' } });
  const before = JSON.stringify(invalid.values);
  assert.throws(() => invalid.context.configureAutoYouTubeLive(), /CHANNEL_ID/);
  assert.equal(JSON.stringify(invalid.values), before);
});

test('個人側の自動検出は継続中の古いライブから新しく開始した同じチャンネルへ切り替える', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  h.context.configureAutoYouTubeLive();
  const old = h.liveVideo({ id: 'old_video01', liveStreamingDetails: {
    actualStartTime: new Date(h.now() - 3600000).toISOString(), activeLiveChatId: 'old-chat' } });
  h.setVideos([old]);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  h.advance(3600000);
  const next = h.liveVideo({ id: 'new_video01', liveStreamingDetails: {
    actualStartTime: new Date(h.now() - 60000).toISOString(), activeLiveChatId: 'new-chat' } });
  const other = h.liveVideo({ id: 'other_video', snippet: { channelId: 'another-channel' }, liveStreamingDetails: {
    actualStartTime: new Date(h.now()).toISOString(), activeLiveChatId: 'other-chat' } });
  h.setVideos([old, next, other]);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  assert.deepEqual(h.calls.chats.map(call => call.payload.snippet.liveChatId), ['old-chat', 'new-chat']);
  assert.equal(h.values.YOUTUBE_VIDEO_ID, undefined);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.gemini.length, 0);
});

test('別アカウントの自動検出は対象チャンネルだけを検索し検索間隔後に新しい配信へ切り替える', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, properties: { CHANNEL_ID: 'UCaaaaaaaaaaaaaaaaaaaaaa' } });
  h.context.configureAutoYouTubeLive();
  const channelId = h.values.CHANNEL_ID;
  const video = (id, start, chat) => h.liveVideo({ id, snippet: { channelId },
    liveStreamingDetails: { actualStartTime: new Date(start).toISOString(), activeLiveChatId: chat } });
  const old = video('old_video01', h.now() - 3600000, 'old-chat');
  h.setVideos([old]);
  assert.equal(h.context.previewYouTubeConnection().videoId, 'old_video01');
  assert.equal(h.calls.searches[0].params.channelId, channelId);
  assert.equal(h.calls.searches[0].params.eventType, 'live');
  assert.equal(h.calls.searches[0].params.order, 'date');
  assert.equal(h.calls.searches[0].params.maxResults, 50);
  h.advance(30 * 60000);
  const next = video('new_video01', h.now() - 60000, 'new-chat');
  h.setVideos([old, next]);
  assert.equal(h.context.previewYouTubeConnection().videoId, 'old_video01');
  assert.equal(h.calls.searches.length, 1);
  h.advance(30 * 60000);
  assert.equal(h.context.previewYouTubeConnection().videoId, 'new_video01');
  assert.equal(h.calls.searches.length, 2);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.gemini.length, 0);
});

test('個人側は自動検出でライブがない間は待ち開始後は準備済みの文を投稿する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  h.context.configureAutoYouTubeLive();
  h.setVideos([]);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'no_live');
  assert.equal(h.calls.chats.length, 0);
  h.advance(3600000);
  h.setVideos([h.liveVideo({ id: 'new_video01' })]);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).youtube, 'sent');
  assert.equal(h.calls.chats.length, 1);
  assert.equal(h.calls.gemini.length, 0);
});

test('自動検出の接続プレビューは選んだURLを表示し最新ライブのチャット無効を見送る', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  h.context.configureAutoYouTubeLive();
  h.setVideos([h.liveVideo({ id: 'new_video01' })]);
  assert.equal(h.context.previewYouTubeConnection().status, 'ready');
  assert.ok(h.calls.console.some(line => line.includes('https://www.youtube.com/watch?v=new_video01')));
  const old = h.liveVideo({ id: 'old_video01', liveStreamingDetails: {
    actualStartTime: new Date(h.now() - 3600000).toISOString(), activeLiveChatId: 'old-chat' } });
  const next = h.liveVideo({ id: 'new_video01', liveStreamingDetails: {
    actualStartTime: new Date(h.now() - 60000).toISOString() } });
  h.setVideos([old, next]);
  assert.equal(h.context.postPreparedCommentToYouTube({ triggerUid: 'personal' }).status, 'no_live');
  assert.equal(h.calls.chats.length, 0);
});

test('ライブ検索に未反映でもチャンネルの動画一覧から公開ライブを検出する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], uploads: ['new_video01'] });
  h.context.configureAutoYouTubeLive();
  h.setVideos([h.liveVideo({ id: 'new_video01' })]);
  const before = h.values.YOSAN_STATE_V1;
  assert.equal(h.context.previewYouTubeConnection().videoId, 'new_video01');
  assert.equal(h.calls.searches[0].part, 'snippet');
  assert.equal(h.calls.playlists.length, 1);
  assert.equal(h.calls.playlists[0].params.maxResults, 50);
  assert.equal(h.calls.playlists[0].params.playlistId, 'uploads-playlist');
  assert.ok(h.calls.channelRequests.some(call => call.params.id === CHANNEL));
  assert.ok(h.calls.console.some(line => line.includes('対象チャンネル名: "テスト配信チャンネル"')));
  assert.equal(h.values.YOSAN_STATE_V1, before);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.gemini.length, 0);
  assert.equal(h.values['YOSAN_LIVE_VIDEO_' + CHANNEL], 'new_video01');
});

test('検索間隔待ちでも取得済みライブがなければ動画一覧から探し検索時刻は維持する', () => {
  const now = Date.parse('2026-11-08T05:03:00Z');
  const searchKey = 'YOSAN_LAST_SEARCH_' + CHANNEL;
  const last = String(now - 3 * 60000);
  const school = preparedSchool({ now }); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now, ownsChannel: false, uploads: ['new_video01'], properties: { [searchKey]: last } });
  h.context.configureAutoYouTubeLive();
  h.setVideos([h.liveVideo({ id: 'new_video01' })]);
  assert.equal(h.context.previewYouTubeConnection().status, 'ready');
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.playlists.length, 1);
  assert.equal(h.values[searchKey], last);
  assert.ok(h.calls.console.some(line => line.includes('次の検索まで約57分')));
});

test('動画一覧でも別チャンネルと終了済みと開始前を投稿先にしない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], uploads: ['other_video', 'ended_video', 'next_video1'] });
  h.context.configureAutoYouTubeLive();
  h.setVideos([
    h.liveVideo({ id: 'other_video', snippet: { channelId: 'another-channel' } }),
    h.liveVideo({ id: 'ended_video', liveStreamingDetails: { actualStartTime: '2026-11-07T01:00:00Z', actualEndTime: '2026-11-07T02:00:00Z' } }),
    h.liveVideo({ id: 'next_video1', liveStreamingDetails: { scheduledStartTime: '2030-01-01T00:00:00Z' } })
  ]);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'no_live');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.values['YOSAN_LIVE_VIDEO_' + CHANNEL], undefined);
  assert.ok(h.calls.console.some(line => line.includes('対象チャンネルの配信中0件')));
  assert.ok(h.calls.console.some(line => line.includes('別チャンネル1件') && line.includes('開始未確認1件') && line.includes('終了済み1件')));
});

test('動画一覧の最新ライブでチャットが無効なら古いチャットへ投稿しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], uploads: ['old_video01', 'new_video01'] });
  h.context.configureAutoYouTubeLive();
  h.setVideos([
    h.liveVideo({ id: 'old_video01', liveStreamingDetails: { actualStartTime: '2026-11-07T01:00:00Z', activeLiveChatId: 'old-chat' } }),
    h.liveVideo({ id: 'new_video01', liveStreamingDetails: { actualStartTime: '2026-11-08T01:00:00Z' } })
  ]);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'no_live');
  assert.equal(h.calls.chats.length, 0);
  assert.ok(h.calls.console.some(line => line.includes('new_video01: チャットIDなし')));
});

test('検索待ちとキャッシュの配信中を区別し不要な動画一覧APIを呼ばない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const now = school.now();
  const h = personalWithPrepared(school, { ownsChannel: false, uploads: ['new_video01'], properties: {
    ['YOSAN_LAST_SEARCH_' + CHANNEL]: String(now - 60000), ['YOSAN_LIVE_VIDEO_' + CHANNEL]: 'cachedvideo'
  } });
  h.context.configureAutoYouTubeLive();
  h.setVideos([h.liveVideo({ id: 'cachedvideo' })]);
  assert.equal(h.context.previewYouTubeConnection().videoId, 'cachedvideo');
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.playlists.length, 0);
  assert.equal(h.calls.channels, 1);
});

test('対象チャンネルが見つからない場合はログで区別して別チャンネルへ変更しない', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], targetChannel: null });
  h.context.configureAutoYouTubeLive();
  const target = h.values.CHANNEL_ID;
  assert.equal(h.context.previewYouTubeConnection().status, 'no_live');
  assert.ok(h.calls.console.some(line => line.includes('対象チャンネルを取得できません')));
  assert.equal(h.values.CHANNEL_ID, target);
  assert.equal(h.calls.playlists.length, 0);
});

test('動画一覧にアクセスできない場合は理由を表示し投稿せず待機する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], uploads: ['new_video01'],
    playlistFailure: new Error('playlistItemsNotAccessible') });
  h.context.configureAutoYouTubeLive();
  assert.equal(h.context.previewYouTubeConnection().status, 'no_live');
  assert.ok(h.calls.console.some(line => line.includes('動画一覧にアクセスできません')));
  assert.equal(h.calls.chats.length, 0);
});

test('動画一覧APIのクォータエラーは隠さず次の実行も停止する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], uploads: ['new_video01'],
    playlistFailure: new Error('quotaExceeded') });
  h.context.configureAutoYouTubeLive();
  assert.equal(h.context.postPreparedCommentToYouTube().code, 'quotaExceeded');
  const before = h.calls.channels;
  h.advance(3600000);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'rate_limited');
  assert.equal(h.calls.channels, before);
  assert.equal(h.calls.playlists.length, 1);
  assert.equal(h.calls.chats.length, 0);
});

test('不正な自動検出チャンネルIDはAPIを呼ぶ前に設定エラーとして診断する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { properties: { YOUTUBE_VIDEO_ID: undefined, CHANNEL_ID: 'https://www.youtube.com/@example' } });
  const result = h.context.postPreparedCommentToYouTube();
  assert.equal(result.code, 'CONFIG_INVALID');
  assert.equal(h.calls.channels, 0);
  assert.equal(h.calls.searches.length, 0);
});

test('確認用の動画から配信元を登録し固定IDを解除してunknownと使用済み予算を保つ', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const channelId = 'UCbbbbbbbbbbbbbbbbbbbbbb';
  const h = personalWithPrepared(school, { properties: { YOUTUBE_VIDEO_ID: 'new_video01' } });
  h.setVideos([h.liveVideo({ id: 'new_video01', snippet: { channelId } })]);
  const state = h.state(); state.youtube = 'unknown';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  const stateBefore = h.values.YOSAN_STATE_V1;
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1);
  limits.youtube = { day: h.context.quotaDay_(), count: 77, lastPost: h.now() - 60000, nameSequence: 12 };
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
  const result = h.context.configureAutoYouTubeLiveFromVideo();
  assert.equal(result.channelId, channelId);
  assert.equal(h.values.CHANNEL_ID, channelId);
  assert.equal(h.values.YOUTUBE_VIDEO_ID, undefined);
  assert.equal(h.values['YOSAN_LIVE_VIDEO_' + channelId], 'new_video01');
  assert.equal(h.values.YOSAN_STATE_V1, stateBefore);
  const after = JSON.parse(h.values.YOSAN_LIMITS_V1);
  assert.equal(after.youtube.count, 78);
  assert.equal(after.youtube.nameSequence, 12);
  assert.equal(after.youtube.lastPost, limits.youtube.lastPost);
  assert.deepEqual(after.gemini, limits.gemini);
  assert.equal(h.calls.videos.length, 1);
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.gemini.length, 0);
});

test('確認用動画が未設定や取得不可なら配信先を変更しない', () => {
  for (const missing of [true, false]) {
    const h = harness({ properties: { YOUTUBE_VIDEO_ID: missing ? undefined : 'new_video01', CHANNEL_ID: CHANNEL }, videos: [] });
    assert.throws(() => h.context.configureAutoYouTubeLiveFromVideo(), /YOUTUBE_VIDEO_ID|配信元を取得できません/);
    assert.equal(h.values.CHANNEL_ID, CHANNEL);
    assert.equal(h.values.YOUTUBE_VIDEO_ID, missing ? undefined : 'new_video01');
    assert.equal(h.calls.chats.length, 0);
    assert.equal(h.calls.releases, 1);
  }
});

test('動画から確認したライブは検索待ちでも初期候補として検証して接続できる', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const channelId = 'UCbbbbbbbbbbbbbbbbbbbbbb';
  const h = personalWithPrepared(school, { ownsChannel: false, searchItems: [], properties: {
    YOUTUBE_VIDEO_ID: 'new_video01', ['YOSAN_LAST_SEARCH_' + channelId]: String(school.now())
  } });
  h.setVideos([h.liveVideo({ id: 'new_video01', snippet: { channelId } })]);
  h.context.configureAutoYouTubeLiveFromVideo();
  assert.equal(h.context.previewYouTubeConnection().status, 'ready');
  assert.equal(h.calls.videos.length, 2);
  assert.equal(h.calls.searches.length, 0);
  assert.equal(h.calls.playlists.length, 0);
  assert.equal(h.calls.chats.length, 0);
});

test('終了済みの確認用動画はチャンネルの登録だけに使い配信中キャッシュにはしない', () => {
  const h = harness({ properties: { YOUTUBE_VIDEO_ID: 'ended_video' }, videos: [{
    id: 'ended_video', snippet: { channelId: CHANNEL },
    liveStreamingDetails: { actualStartTime: '2026-11-01T01:00:00Z', actualEndTime: '2026-11-01T02:00:00Z' }
  }] });
  h.context.configureAutoYouTubeLiveFromVideo();
  assert.equal(h.values.CHANNEL_ID, CHANNEL);
  assert.equal(h.values.YOUTUBE_VIDEO_ID, undefined);
  assert.equal(h.values['YOSAN_LIVE_VIDEO_' + CHANNEL], undefined);
  assert.equal(h.calls.chats.length, 0);
});

test('動画からの自動設定も処理中は設定を変えずAPIを呼ばない', () => {
  const h = harness({ busy: true, properties: { YOUTUBE_VIDEO_ID: 'new_video01' } });
  assert.equal(h.context.configureAutoYouTubeLiveFromVideo().status, 'busy');
  assert.equal(h.values.YOUTUBE_VIDEO_ID, 'new_video01');
  assert.equal(h.calls.videos.length, 0);
});

test('利用者が指摘した一人で清掃後の再会を待つ物語は採用せずAPIを追加しない', () => {
  const feeling = 'わたし、今は静かにひとりで待っているけれど、きれいになったお部屋でみんなとまた会えるのをマイペースに楽しみにしているんだよ。';
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(feeling, { cleaningStatusText: '清掃中' })] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
  assert.ok(h.calls.console.some(line => line.includes('[unsupported_story]')));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, undefined);
  assert.equal(h.values.YOSAN_FEELING_HISTORY_V1, undefined);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).gemini.count, 1);
});

test('隔離や再会の設定はUI読取りを無効にした互換モードでも投稿しない', () => {
  for (const feeling of ['ぼく、今は一人で待ちたい気分。', 'わたし、みんなと再会できるのが楽しみ。', 'ぼく、新しい場所への引っ越しが楽しみ。', 'ぼく、一匹で待つのも楽しみ。', 'わたし、仲間に会えるのが楽しみ。', 'ぼく、元の部屋に戻れるのが楽しみ。']) {
    const h = harness({ geminiResponses: [geminiResponse(feeling)] });
    assert.equal(h.run().status, 'grounding_mismatch');
    assert.equal(h.calls.chats.length, 0);
    assert.equal(h.calls.logs.length, 0);
    assert.equal(h.calls.gemini.length, 1);
  }
});

test('掃除中のUI表示がなければ掃除の気持ちは見送る', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('ぼく、掃除の間もゆったり過ごしたいな。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
  assert.ok(h.calls.console.some(line => line.includes('[cleaning_not_confirmed]')));
  assert.equal(h.calls.logs.length, 0);
});

test('UIに清掃中と明示され直近に掃除がなければ個人側でも追加解析なしで投稿する', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-08T05:59:00Z'), properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'true' },
    geminiResponses: [careResponse('ぼく、掃除の間もゆったり過ごしたいな。', { cleaningStatusText: '清掃中' })] });
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(school.state().rearing.cleaningStatusText, '清掃中');
  const request = JSON.parse(school.calls.gemini[0].request.payload);
  assert.ok(request.generationConfig.responseJsonSchema.required.includes('cleaningStatusText'));
  const h = personalWithPrepared(school, { now: school.now() });
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.calls.chats[0].payload.snippet.textMessageDetails.messageText,
    '2026/11/08 14:59\nこはく：ぼく、掃除の間もゆったり過ごしたいな。');
  assert.equal(h.calls.gemini.length, 0);
});

test('掃除は言い換えても直近8件にあれば見送り過去の不確かな物語をAIへ引き継がない', () => {
  const past = 'わたし、ひとりで掃除が終わるのを待っているけど再会が楽しみ。';
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'true',
    YOSAN_FEELING_HISTORY_V1: JSON.stringify({ texts: [past] }) },
    geminiResponses: [careResponse('ぼく、ピカピカのお部屋がうれしいな。', { cleaningStatusText: '清掃中' })] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
  assert.ok(h.calls.console.some(line => line.includes('[repeated_cleaning]')));
  const request = JSON.parse(h.calls.gemini[0].request.payload);
  assert.ok(request.systemInstruction.parts[0].text.includes('直近8件に掃除関連があるので'));
  assert.ok(!request.contents[0].parts[0].text.includes(past));
  assert.equal(JSON.parse(h.values.YOSAN_FEELING_HISTORY_V1).texts.length, 1);
  assert.equal(h.calls.gemini.length, 1);
});

test('掃除の話題は変化モードが無効でも続けず通常の気持ちは採用できる', () => {
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'false',
    YOSAN_FEELING_HISTORY_V1: JSON.stringify({ texts: ['ぼく、清掃の間も安心していたいな。'] }) },
    geminiResponses: [careResponse('わたし、掃除の間もここでゆっくりしたいな。', { cleaningStatusText: '掃除中' }),
      careResponse('ぼく、きれいな葉っぱの形が好きだな。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
  h.advance(3600000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.calls.gemini.length, 2);
});

test('掃除の話題の後に別の実況8件が採用されるまで次の掃除の話題を採用しない', () => {
  const cleaning = 'ぼく、掃除の間もゆったり過ごしたいな。';
  const others = ['ぼく、この葉のふちの形が気になるな。', 'わたし、仲間のそばだと安心するよ。',
    'ぼく、白い体のしま模様がお気に入り。', 'わたし、ここで少し背伸びしたい気分。',
    'ぼく、次のひと口が待ち遠しいな。', 'わたし、丸くなってくつろぎたいな。',
    'ぼく、居場所を選ぶのも楽しいんだ。', 'わたし、この葉の緑色が好きだよ。'];
  const replies = [cleaning, ...others.slice(0, 7), cleaning, others[7], cleaning]
    .map(text => careResponse(text, { cleaningStatusText: '清掃中' }));
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'true' }, geminiResponses: replies });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  for (let i = 0; i < 7; i++) { h.advance(3600000); assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared'); }
  h.advance(3600000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
  h.advance(3600000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  h.advance(3600000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.calls.gemini.length, 11);
  assert.equal(h.calls.logs.length, 10);
});

test('清掃中の否定や完了予定を清掃中の根拠にしない', () => {
  for (const cleaningStatusText of ['清掃中ではない', '清掃中ではありません', '清掃予定', '清掃完了', '清掃中止', null]) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
      careResponse('ぼく、掃除の間もゆっくり過ごしたいな。', { cleaningStatusText })
    ] });
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
    assert.equal(h.calls.logs.length, 0);
  }
});

test('清掃状態の読取りは欠落を不明にし不正な型を拒否する', () => {
  const h = preparedSchool();
  const data = { stageText: null, temperatureText: null, humidityText: null, feeling: 'ぼく、ここが好き。' };
  assert.equal(h.context.parseRearingResponse_(JSON.stringify(data)).observation.cleaningStatusText, null);
  for (const value of [true, {}, 123, '清'.repeat(121)]) {
    assert.throws(() => h.context.parseRearingResponse_(JSON.stringify({ ...data, cleaningStatusText: value })), /清掃状態/);
  }
});

test('古い本文は個人側でプレビューも投稿もせず新しい学校側の解析を待つ', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const state = h.state(); state.analysisVersion = 'rearing-first-person-v2';
  state.feeling = 'ぼく、ひとりで掃除が終わるのを楽しみに待っているよ。';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  const before = JSON.stringify(h.values);
  assert.equal(h.context.previewPreparedComment().status, 'waiting_analysis');
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'waiting_analysis');
  assert.equal(JSON.stringify(h.values), before);
  assert.equal(h.calls.videos.length, 0);
  assert.equal(h.calls.chats.length, 0);
});

test('互換モードの古い本文も学校側で新しく解析してから投稿する', () => {
  const school = preparedSchool(); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const state = h.state(); state.analysisVersion = 'first-person-v1';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  assert.equal(h.context.previewPreparedComment().status, 'waiting_analysis');
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'waiting_analysis');
  assert.equal(h.calls.chats.length, 0);
});

test('新しい版でも保存後に一人の物語へ改変された本文を表示も送信もしない', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const state = h.state(); state.feeling = 'わたし、一人でみんなと再会するのを楽しみにしているよ。';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  assert.equal(h.context.previewPreparedComment().status, 'grounding_mismatch');
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'grounding_mismatch');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.state().youtube, 'pending');
});

test('本文検査の更新でもunknownと名前の順番を解除しない', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const state = school.state(); state.youtube = 'unknown'; state.analysisVersion = 'rearing-first-person-v2';
  school.values.YOSAN_STATE_V1 = JSON.stringify(state);
  const before = school.values.YOSAN_LIMITS_V1;
  school.advance(3600000); school.refreshImage();
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'unknown');
  assert.equal(school.values.YOSAN_LIMITS_V1, before);
  assert.equal(school.calls.gemini.length, 1);
  const h = personalWithPrepared(school);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'unknown');
  assert.equal(h.calls.chats.length, 0);
});

test('分までの表示はプレビュー時刻と送信時刻で組み立て本文と名前の順番は勝手に変えない', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-08T04:30:00Z'), properties: CARE_PROPERTIES,
    geminiResponses: [careResponse('ぼく、この葉のふちが気になるな。')] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: Date.parse('2026-11-08T05:59:00Z') });
  const before = JSON.stringify(h.values);
  assert.equal(h.context.previewPreparedComment().messageText, '2026/11/08 14:59\nこはく：ぼく、この葉のふちが気になるな。');
  assert.ok(h.calls.console.some(line => line.includes('本文の解析日時: 2026/11/08 13:30')));
  h.advance(60000);
  assert.equal(h.context.previewPreparedComment().messageText, '2026/11/08 15:00\nこはく：ぼく、この葉のふちが気になるな。');
  assert.equal(JSON.stringify(h.values), before);
  assert.equal(h.calls.gemini.length, 0);
  h.advance(60000);
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.state().youtubeComment.dateTime, '2026/11/08 15:01');
  assert.equal(h.calls.gemini.length, 0);
});

test('プレビューは同じ本文を示し学校側の次の解析で初めて本文が更新される', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-08T04:30:00Z'), properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'true' },
    geminiResponses: [careResponse('ぼく、この葉のふちが気になるな。'), careResponse('わたし、ここで体をゆるめたい気分。')] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: school.now() });
  const first = h.context.previewPreparedComment().messageText;
  assert.equal(h.context.previewPreparedComment().messageText, first);
  assert.equal(h.calls.gemini.length, 0);
  school.advance(3600000);
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  const updated = personalWithPrepared(school, { now: school.now() });
  assert.ok(updated.context.previewPreparedComment().messageText.includes('体をゆるめたい気分'));
  assert.equal(school.calls.gemini.length, 2);
});

test('旧プレビューに残る物語は新しい画像解析で再利用しない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [
    careResponse('ぼく、この葉のふちが気になるな。'), careResponse('わたし、ここで体をゆるめたい気分。')
  ] });
  h.context.previewSchoolAnalysis();
  const old = JSON.parse(h.values.YOSAN_PREVIEW_V1);
  old.analysisVersion = 'rearing-first-person-v2'; old.feeling = 'ぼく、ひとりで掃除の後の再会が楽しみ。';
  h.values.YOSAN_PREVIEW_V1 = JSON.stringify(old);
  h.advance(3600000);
  assert.equal(h.context.previewSchoolAnalysis().feeling, 'わたし、ここで体をゆるめたい気分。');
  assert.equal(h.calls.gemini.length, 2);
});

test('本文検査の更新でスクリプトプロパティのモデル指定を変えない', () => {
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, GEMINI_MODEL: 'gemini-3.6-flash' }, geminiResponses: [careResponse()] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.ok(h.calls.gemini[0].url.endsWith('/gemini-3.6-flash:generateContent'));
  assert.equal(h.values.GEMINI_MODEL, 'gemini-3.6-flash');
});

test('学校の手動解析は24回予算でも1分後に同じ写真を解析でき待機時刻を表示する', () => {
  const h = preparedSchool({ now: Date.parse('2026-11-08T05:59:00Z'),
    properties: { ...CARE_PROPERTIES, GEMINI_DAILY_REQUEST_BUDGET: '24', ENABLE_FEELING_VARIATION: 'true' },
    geminiResponses: [careResponse('ぼく、この葉のふちが気になるな。'), careResponse('わたし、ここで体をゆるめたい気分。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  const first = h.state();
  h.advance(30000);
  const waiting = h.context.analyzeLatestImageAndLog();
  assert.equal(waiting.status, 'rate_limited');
  assert.ok(waiting.reason.includes('2026/11/08 15:00:00'));
  assert.ok(waiting.reason.includes('あと約30秒'));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.state().analysisKey, first.analysisKey);
  h.advance(30000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.state().key, first.key);
  assert.ok(h.state().analysisKey !== first.analysisKey);
  assert.equal(h.state().feeling, 'わたし、ここで体をゆるめたい気分。');
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(h.calls.logs.length, 2);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).gemini.count, 2);
  assert.equal(h.values.GEMINI_DAILY_REQUEST_BUDGET, '24');
  assert.equal(h.calls.chats.length, 0);
});

test('明示的な学校の手動更新は変化モード無効でも新しい本文を記録し名前を進めない', () => {
  const h = preparedSchool({ properties: { GEMINI_DAILY_REQUEST_BUDGET: '24', ENABLE_FEELING_VARIATION: 'false' },
    geminiResponses: [geminiResponse('ぼく、この葉のふちが気になるな。'), geminiResponse('わたし、ここで体をゆるめたい気分。')] });
  h.context.analyzeLatestImageAndLog();
  const state = h.state(); state.youtube = 'sent';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  const limits = JSON.parse(h.values.YOSAN_LIMITS_V1); limits.youtube.nameSequence = 12;
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
  h.advance(60000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.state().youtube, 'pending');
  assert.equal(h.state().feeling, 'わたし、ここで体をゆるめたい気分。');
  assert.equal(h.calls.logs.length, 2);
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 12);
  assert.equal(h.calls.chats.length, 0);
});

test('手動解析を短くしても日次予算到達後は自動解析も追加しない', () => {
  const h = preparedSchool({ now: Date.parse('2026-11-08T05:00:00Z'), properties: { ...CARE_PROPERTIES, GEMINI_DAILY_REQUEST_BUDGET: '2' },
    geminiResponses: [careResponse('ぼく、この葉のふちが気になるな。'), careResponse('わたし、ここで体をゆるめたい気分。')] });
  h.context.analyzeLatestImageAndLog();
  h.advance(60000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  h.advance(60000);
  const blocked = h.context.analyzeLatestImageAndLog();
  assert.equal(blocked.status, 'rate_limited');
  assert.ok(blocked.reason.includes('1日予算'));
  h.advance(3600000);
  assert.equal(h.context.analyzeLatestImageAndLog({ triggerUid: 'school' }).status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 2);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).gemini.count, 2);
});

test('学校の手動更新もGemini429の待機を解除しない', () => {
  const h = preparedSchool({ now: Date.parse('2026-11-08T05:00:00Z'), properties: CARE_PROPERTIES,
    geminiResponses: [response(429, {}), careResponse()] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'rate_limited');
  const before = h.values.YOSAN_LIMITS_V1;
  h.advance(60000);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'rate_limited');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.values.YOSAN_LIMITS_V1, before);
});

test('解析プレビューの連続API呼出しは従来の間隔を維持する', () => {
  const h = preparedSchool({ now: Date.parse('2026-11-08T05:00:00Z'), properties: { ...CARE_PROPERTIES, GEMINI_DAILY_REQUEST_BUDGET: '24' },
    geminiResponses: [careResponse(), careResponse('わたし、ここで体をゆるめたい気分。')] });
  assert.equal(h.context.previewSchoolAnalysis().status, 'preview');
  h.advance(60000); h.refreshImage();
  const blocked = h.context.previewSchoolAnalysis();
  assert.equal(blocked.status, 'rate_limited');
  assert.ok(blocked.reason.includes('2026/11/08 15:00:00'));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.calls.gemini.length, 2);
});

test('変化モードも飼育UIも無効な学校の手動更新でもunknownを解除しない', () => {
  for (const refreshImage of [false, true]) {
    const h = preparedSchool();
    h.context.analyzeLatestImageAndLog();
    const state = h.state(); state.youtube = 'unknown';
    h.values.YOSAN_STATE_V1 = JSON.stringify(state);
    const limits = h.values.YOSAN_LIMITS_V1;
    h.advance(60000);
    if (refreshImage) h.refreshImage();
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'unknown');
    assert.equal(h.state().youtube, 'unknown');
    assert.equal(h.values.YOSAN_LIMITS_V1, limits);
    assert.equal(h.calls.gemini.length, 1);
  }
});

test('学校の初回記録は利用できる解析プレビューを再利用し余分にAPIを呼ばない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  assert.equal(h.context.previewSchoolAnalysis().status, 'preview');
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 1);
});

test('使用量表示は学校の手動更新と解析プレビューの間隔を区別する', () => {
  const h = preparedSchool({ properties: { GEMINI_DAILY_REQUEST_BUDGET: '24', GEMINI_MODEL: 'gemini-3.6-flash' } });
  const before = JSON.stringify(h.values);
  const report = h.context.showBotUsage();
  assert.equal(report.model, 'gemini-3.6-flash');
  assert.equal(report.schoolManualAnalysisMinMinutes, 1);
  assert.equal(report.geminiMinMinutes, 60);
  assert.equal(JSON.stringify(h.values), before);
  assert.equal(h.calls.gemini.length, 0);
});

const COIN_FEELING = '一円玉と並ぶと、ぼくの体の長さが伝わるとうれしいな。';
const COIN_UI = { coinReferenceText: '蚕のそばに一円玉の実物が見える' };
function setCoinGap(h, value) {
  const limits = h.values.YOSAN_LIMITS_V1 ? JSON.parse(h.values.YOSAN_LIMITS_V1) : {};
  limits.youtube ||= {};
  limits.youtube.coinFreePosts = value;
  h.values.YOSAN_LIMITS_V1 = JSON.stringify(limits);
}
function setPendingFeeling(h, feeling) {
  const state = h.state();
  state.youtube = 'pending'; state.feeling = feeling;
  state.rearing.coinReferenceText = COIN_UI.coinReferenceText;
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
}

test('実物の一円玉は現在の体の大きさの比較としてだけ採用する', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(COIN_FEELING, COIN_UI)] });
  setCoinGap(h, 4);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  assert.equal(h.state().rearing.coinReferenceText, COIN_UI.coinReferenceText);
  assert.equal(h.state().feeling, COIN_FEELING);
  const request = JSON.parse(h.calls.gemini[0].request.payload);
  assert.ok(request.generationConfig.responseJsonSchema.required.includes('coinReferenceText'));
  assert.ok(request.systemInstruction.parts[0].text.includes('比較用の目印'));
  assert.ok(request.systemInstruction.parts[0].text.includes('過去のチャット'));
  assert.equal(h.calls.gemini.length, 1);
});

test('添付チャットのコインや銀色の台座を寝床にする言い換えは採用しない', () => {
  const feelings = [
    'コインの丸い形に体を預けると、ぼくは心地いいな。',
    '真ん中のツルツルした金属の上、ぼくのお気に入りの場所なんだ。',
    'コインの上で横たわると、ぼくは一番心地いいな。',
    'かたい台座に並ぶの、ぼくたちの楽しい集会みたい。',
    'ぼくの体のサイズにぴったりな一円玉のベッドが好き。', 'こいんの上がぼくのお気に入り。', 'COINの上がぼくの好きな場所。'
  ];
  for (const feeling of feelings) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(feeling, COIN_UI)] });
    setCoinGap(h, 4);
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
    assert.ok(h.calls.console.some(line => line.includes('[coin_not_size_reference]')));
    assert.equal(h.calls.gemini.length, 1);
    assert.equal(h.calls.logs.length, 0);
  }
});

test('コインがない時やチャットの文字だけを根拠にコインの話題を引き継がない', () => {
  for (const coinReferenceText of [null, 'コインは写っていない', '一円玉はありません', '硬貨は写っていません', '一円玉らしいものがある', 'チャットに一円玉という文字だけがある', '銀色の丸いものがある']) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(COIN_FEELING, { coinReferenceText })] });
    setCoinGap(h, 4);
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
    assert.ok(h.calls.console.some(line => line.includes('[coin_not_visible]')));
    assert.equal(h.calls.logs.length, 0);
  }
});

test('コインが写っていても通常の蚕の気持ちを優先しコインの話題を強制しない', () => {
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('ぼく、この葉のふちが気になるな。', COIN_UI)] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  const request = JSON.parse(h.calls.gemini[0].request.payload);
  assert.ok(request.systemInstruction.parts[0].text.includes('今回は硬貨の話題を使わず'));
  assert.equal(h.state().feeling, 'ぼく、この葉のふちが気になるな。');
  assert.equal(h.calls.gemini.length, 1);
});

test('一枚のコイン写真から過去との成長や体長と倍率を断定しない', () => {
  for (const feeling of [
    '一円玉と比べると、昨日より大きくなったぼくがうれしいな。',
    '一円玉を目安にするとぼくの体長は25mm、うれしいな。',
    'コインと比べてぼくのサイズは2倍、うれしいな。'
  ]) {
    const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(feeling, COIN_UI)] });
    setCoinGap(h, 4);
    assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
    assert.ok(h.calls.console.some(line => line.includes('[coin_unverified_growth]')));
    assert.equal(h.calls.logs.length, 0);
  }
});

test('生成時にも直近のコイン話題を言い換えた繰り返しを採用しない', () => {
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES,
    YOSAN_FEELING_HISTORY_V1: JSON.stringify({ texts: ['硬貨を目安にぼくの体の大きさがわかるとうれしいな。'] }) },
    geminiResponses: [careResponse(COIN_FEELING, COIN_UI)] });
  setCoinGap(h, 4);
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'grounding_mismatch');
  assert.ok(h.calls.console.some(line => line.includes('[repeated_coin_generation]')));
  assert.equal(h.calls.gemini.length, 1);
});

test('実投稿は名前と日時が変わってもコインが連続せず別の話題を4回はさむ', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-10T09:00:00Z'), properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'false' },
    geminiResponses: [careResponse(COIN_FEELING, COIN_UI)] });
  setCoinGap(school, 4);
  assert.equal(school.context.analyzeLatestImageAndLog().status, 'prepared');
  const h = personalWithPrepared(school, { now: school.now() });
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, 0);
  h.advance(3600000);
  const nextCoin = '硬貨を目安に、わたしの体の大きさも伝わると楽しいな。';
  setPendingFeeling(h, nextCoin);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'grounding_mismatch');
  assert.equal(h.calls.chats.length, 1);
  assert.equal(h.state().youtube, 'pending');
  const other = ['ぼく、この葉のふちが気になるな。', 'わたし、仲間のそばで安心だよ。',
    'ぼく、丸くなってくつろぎたい気分。', 'わたし、この葉の形が好きだな。'];
  for (let i = 0; i < other.length; i++) {
    h.advance(3600000);
    setPendingFeeling(h, other[i]);
    assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
    assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, i + 1);
    if (i < 3) {
      h.advance(3600000); setPendingFeeling(h, nextCoin);
      assert.equal(h.context.postPreparedCommentToYouTube().status, 'grounding_mismatch');
    }
  }
  h.advance(3600000); setPendingFeeling(h, nextCoin);
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(h.calls.chats.length, 6);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, 0);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, 6);
  assert.equal(h.calls.gemini.length, 0);
});

test('送信済みの話題間隔はプレビューや解析だけでは進めない', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse('ぼく、この葉の形が好きだな。', COIN_UI)] });
  setCoinGap(school, 2);
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const before = JSON.stringify(h.values);
  for (let i = 0; i < 4; i++) assert.equal(h.context.previewPreparedComment().status, 'preview');
  assert.equal(JSON.stringify(h.values), before);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, 2);
  setPendingFeeling(h, COIN_FEELING);
  assert.equal(h.context.previewPreparedComment().status, 'grounding_mismatch');
  assert.equal(h.calls.chats.length, 0);
});

test('コインの投稿結果が不明でも次のコインを許可せずunknownを保つ', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(COIN_FEELING, COIN_UI)] });
  setCoinGap(school, 4); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { chatFailure: new Error('connection lost') });
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'error');
  assert.equal(h.state().youtube, 'unknown');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, 0);
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.nameSequence, undefined);
  h.advance(3600000);
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'unknown');
  assert.equal(h.calls.chats.length, 1);
});

test('失敗した通常コメントではコイン以外の投稿成功数を増やさない', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  setCoinGap(school, 2); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { chatFailure: new Error('connection lost') });
  h.context.postPreparedCommentToYouTube();
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, 2);
  assert.equal(h.state().youtube, 'unknown');
});

test('日次予算の日付が変わってもコイン話題の投稿間隔をリセットしない', () => {
  const school = preparedSchool({ now: Date.parse('2026-11-10T07:59:00Z'), properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  setCoinGap(school, 3); school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school, { now: school.now() });
  h.advance(24 * 3600000);
  assert.equal(h.context.postPreparedCommentToYouTube().youtube, 'sent');
  assert.equal(JSON.parse(h.values.YOSAN_LIMITS_V1).youtube.coinFreePosts, 4);
});

test('壊れたコイン話題の履歴を黙ってリセットせずAPI前に停止する', () => {
  for (const value of [-1, 1.5, 5, '4', null]) {
    const h = preparedSchool({ properties: CARE_PROPERTIES });
    setCoinGap(h, value);
    const before = h.values.YOSAN_LIMITS_V1;
    assert.throws(() => h.context.analyzeLatestImageAndLog(), /制限状態/);
    assert.equal(h.values.YOSAN_LIMITS_V1, before);
    assert.equal(h.calls.gemini.length, 0);
  }
});

test('前の解析形式のコイン文は新版で再利用せず新しい学校側の解析を待つ', () => {
  const school = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse()] });
  school.context.analyzeLatestImageAndLog();
  const h = personalWithPrepared(school);
  const state = h.state(); state.analysisVersion = 'rearing-grounded-v3';
  state.feeling = 'コインの上がぼくのお気に入りだよ。';
  h.values.YOSAN_STATE_V1 = JSON.stringify(state);
  assert.equal(h.context.previewPreparedComment().status, 'waiting_analysis');
  assert.equal(h.context.postPreparedCommentToYouTube().status, 'waiting_analysis');
  assert.equal(h.calls.chats.length, 0);
  assert.equal(h.calls.videos.length, 0);
});

test('硬貨の根拠欄は未読を不明にし不正な型を拒否する', () => {
  const h = preparedSchool();
  const data = { stageText: null, temperatureText: null, humidityText: null, feeling: 'ぼく、ここが好きだな。' };
  assert.equal(h.context.parseRearingResponse_(JSON.stringify(data)).observation.coinReferenceText, null);
  for (const value of [true, {}, '玉'.repeat(121)]) {
    assert.throws(() => h.context.parseRearingResponse_(JSON.stringify({ ...data, coinReferenceText: value })), /硬貨/);
  }
});

test('報告された視聴者への呼びかけは一人称があっても採用せず追加生成しない', () => {
  const text = '画面の向こうから見守ってくれているみんな、ぼくらの様子が見えるかな。';
  const h = preparedSchool({ properties: CARE_PROPERTIES, geminiResponses: [careResponse(text, {
    stageText: '蚕3齢 (9日目)', temperatureText: '23.9 ℃', humidityText: '77.5 %',
    coinReferenceText: '蚕たちの下に半分隠れるように硬貨が見える'
  })] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'voice_mismatch');
  assert.ok(h.calls.console.some(line => line.includes('[observer_language]')));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.calls.logs.length, 0);
  assert.equal(h.values.YOSAN_STATE_V1, undefined);
  assert.equal(h.values.YOSAN_FEELING_HISTORY_V1, undefined);
});

test('従来視聴者を宛先にしていた文体候補でも本人の好みとして一度で準備できる', () => {
  const feeling = 'わたし、この葉の形が好きだな。';
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'true' },
    geminiResponses: [careResponse(feeling)] });
  h.values.YOSAN_LIMITS_V1 = JSON.stringify({ gemini: { day: h.context.quotaDay_(), count: 4 } });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  const request = JSON.parse(h.calls.gemini[0].request.payload);
  const instruction = request.contents[0].parts[0].text;
  assert.ok(!instruction.includes('配信を見ている人へ'));
  assert.ok(instruction.includes('自分の小さな好み'));
  assert.ok(instruction.includes('本人の好みや願望を含む自問'));
  assert.ok(request.systemInstruction.parts[0].text.includes('本人の胸の中だけで完結する独白'));
  assert.equal(h.calls.gemini.length, 1);
  assert.equal(h.state().feeling, feeling);
  const personal = personalWithPrepared(h);
  assert.ok(personal.context.previewPreparedComment().messageText.includes('こはく：' + feeling));
  assert.equal(personal.calls.gemini.length, 0);
});

test('観察者の過去文は比較用プロンプトへ再投入せず元の履歴は保持する', () => {
  const invalid = '画面の向こうから見守ってくれているみんな、ぼくらの様子が見えるかな。';
  const valid = 'ぼく、この場所が好きだな。';
  const h = preparedSchool({ properties: { ...CARE_PROPERTIES, ENABLE_FEELING_VARIATION: 'true',
    YOSAN_FEELING_HISTORY_V1: JSON.stringify({ texts: [invalid, valid] }) },
    geminiResponses: [careResponse('わたし、体をゆるめて過ごしたい気分。')] });
  assert.equal(h.context.analyzeLatestImageAndLog().status, 'prepared');
  const request = JSON.parse(h.calls.gemini[0].request.payload);
  assert.ok(!request.contents[0].parts[0].text.includes(invalid));
  assert.ok(request.contents[0].parts[0].text.includes(valid));
  assert.ok(JSON.parse(h.values.YOSAN_FEELING_HISTORY_V1).texts.includes(invalid));
  assert.equal(h.calls.gemini.length, 1);
});
