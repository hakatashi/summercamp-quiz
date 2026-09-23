# 全体設計・拡張計画

## 目的

オフラインイベントで行う複数のクイズ企画で共通して使う、LAN 内限定の Web アプリ。
司会者・参加者・モニター・問題編集の4画面がリアルタイムに同期する。
企画 (mode) はプラグインとして追加できるようにする。

| 企画 | mode ID | 司会者 | 参加者 | モニター | 編集 | 感想戦 |
|---|---|---|---|---|---|---|
| シンプル早押しクイズ | `simple-buzzer` | ○ | ○ | ○ | ○ | ○ |
| 早押しクイズ (ボード付き) | `buzzer-board` | ○ | ○ | ○ | ○ | ○ |
| リスニング数学 | `listening-math` | – | – | ○ (再生と操作) | ○ | ○ (モニターから操作) |
| イラスト回文クイズ | `palindrome` | ○ | ○ | ○ | ○ | – |

## 技術スタック

| 用途 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript 7 (ネイティブ版 `tsc`) | 型チェック専用 (`noEmit`)。トランスパイルは Vite と Node の型ストリップが行う |
| フロントエンド | React 19 + Vite 8 + CSS Modules + React Router | |
| テスト | Vitest | 純粋な reducer の単体テストと、サーバーの結合テスト |
| リアルタイム通信 | Socket.IO 4 | 自動再接続、room、ack が使える。スマホのスリープ復帰に強い |
| HTTP | Hono + `@hono/node-server` | 静的ファイル配信、将来のメディアアップロード API |
| 永続化 | `node:sqlite` (Node 組み込み) | 依存なしでイベントログとスナップショットを保存する |
| バリデーション | zod 4 | コマンド payload と問題データ |
| Lint / Format | Biome | typescript-eslint は TS7 の JS API に依存するので使わない |
| サーバー実行 | Node 24 のネイティブ型ストリップ | ビルド不要。`erasableSyntaxOnly` を有効にする (enum などは使わない) |

## ディレクトリ構成

```
src/
  shared/                    クライアントとサーバーで共有する純粋ロジック
    types.ts                 Game / Participant / Role / Viewer などの共通型
    protocol.ts              Socket.IO のイベント型
    questions.ts             問題の共通スキーマ
    modes/
      types.ts               ModeDefinition インターフェース
      registry.ts            全 mode の登録
      simple-buzzer/         reducer、コマンドスキーマ、投影、テスト
  server/
    index.ts                 Hono + Socket.IO を起動する
    db.ts                    SQLite のスキーマとアクセス
    gameManager.ts           コマンド適用 → 永続化 → ブロードキャスト
    socket.ts                接続、認証、room、時刻同期
  client/
    lib/                     socket 接続、useGame フック、時刻同期
    components/              MonitorStage (16:9) / BuzzButton / Scoreboard など
    pages/                   トップ、管理、参加登録、問題編集、各画面の入口
    modes/
      registry.ts            mode → 画面コンポーネント
      simple-buzzer/         HostView / ParticipantView / MonitorView
```

## 中核の設計

### Game と Mode

- **Game** は1つの企画の実施インスタンス (`id, mode, title, questions, participants, state`)。
  リハーサル用と本番用のように、同じ mode で複数の Game を作れる。
- **ModeDefinition** (`src/shared/modes/types.ts`) は次のものを持つ:
  - `questionExtraSchema`: 企画ごとの問題の追加フィールド (genre、画像、ヒント、音声など)
  - `commandSchema`: 企画固有のコマンド (zod の discriminated union)
  - `permissions`: コマンドごとに実行できる role
  - `initialState()` / `reduce(game, command, ctx)`: 純粋関数で、`ctx` にサーバー時刻と実行者が入る
  - `project(game, viewer)`: 閲覧者ごとに送る情報を絞る (参加者やモニターに未出題の答えを送らない)
- クライアント側の `src/client/modes/registry.ts` に、mode ごとの画面コンポーネントを登録する。

**新しい企画を追加する手順**: `src/shared/modes/<mode>/` に ModeDefinition を書く → shared の registry に登録 →
`src/client/modes/<mode>/` に画面を書く → client の registry に登録。サーバー側のコードは変えなくてよい。

### 同期モデル (サーバーが唯一の正)

1. クライアントは `command` を送るだけ。
2. サーバーは権限を確認し、zod で検証してから `reduce` を適用する。
3. イベントを SQLite に追記し、Game のスナップショットを更新する。
4. 閲覧者の種類ごとに `project()` した Game 全体をブロードキャストする (単調増加の `version` 付き)。

- room は `game:{id}:host` / `:monitor` / `:participant:{pid}`。
- 数十人規模なので差分は送らず、毎回 state 全体を送る。
- 問題の編集も共通コマンド (`questions.*`) として同じ経路を通るので、編集画面と司会者画面が常に一致する。
- イベントログは感想戦、監査、将来の undo に使う。

### 認証 (LAN 前提の軽いもの)

- 参加者: 名前を登録するとサーバーがトークンを発行する。トークンは localStorage に保存し、再読込しても同じ参加者に戻れる。
- 司会者と問題編集: 環境変数 `HOST_PASSWORD` で保護する (未設定なら誰でも使える)。
- モニター: 閲覧のみなので認証しない。ただし答えなど秘匿すべき情報は投影で除く。

### 早押しの公平性

- クライアントはサーバーと ping を交換して時計のオフセットを推定する (NTP 方式で、RTT が最小のサンプルを採用)。
- `touchstart` / `pointerdown` / `keydown` (Enter・Space) で押した瞬間の時刻をサーバー時刻に換算して送る。
- サーバーは申告された時刻を `[受信時刻 - 500ms, 受信時刻]` に丸めて使う。まだ判定していない押下だけを時刻順に並べ直す。

### モニター (16:9)

`MonitorStage` が 1920×1080 固定のステージを `transform: scale()` で画面に合わせる。スクロールは出さない。

### URL

| URL | 画面 |
|---|---|
| `/` | ゲーム一覧 |
| `/admin` | ゲーム作成と管理 |
| `/games/:id/host` | 司会者 |
| `/games/:id/play` | 参加者 (未登録なら名前を登録) |
| `/games/:id/monitor` | モニター |
| `/games/:id/edit` | 問題編集 |

## 企画ごとの拡張計画

### simple-buzzer (フェーズ1)

- 押した順に回答権を得る。正解 +1、誤答 -1。誤答した人はその問題でボタンを押せない。
- 押した人が全員誤答したら読み上げを再開する。参加者全員が誤答したら問題を終了する。
- 司会者の補正操作: 押下のリセット、問題のスキップ、再オープン、得点の直接編集、参加者の削除。
- 出題ごとの記録 `history` (出題前の得点、押下と判定) を残しておき、感想戦で使う。

### buzzer-board

- simple-buzzer の reducer とは別に実装する。ただし押下の受付や時刻補正などの部品は共通化する。
- 追加する state: 休みの残り問題数、勝ち抜け、連答カウンタ、ジャンル選択権、ボード回答 (提出、仮判定、確定)。
- 問題の追加フィールド: `genre` (13種)。次の問題はジャンルの中からランダムに選ぶ (乱数は ctx で注入する)。

### listening-math

- 問題の追加フィールド: `audio` (アップロードしたファイルの ID)。
- モニター画面が再生を担当する。state は `mode: 'playing' | 'review'` と現在の問題番号を持つ。

### palindrome

- 問題の追加フィールド: `image`, `answer` (かな), `hintOrder` (文字を開ける順番)。
- 回答の検証: かなに正規化する → 文字数が一致するか → 回文か → 開いている文字と合っているか。クライアントとサーバーの両方で `shared` の同じ関数を使う。
- AI 参加者: サーバーで Claude API (`@anthropic-ai/sdk`) を使う。出題時とヒント開示時に、画像、伏せ字パターン、ルールを渡して回答させる。
  モデルは `claude-opus-5` (adaptive thinking)、出力は構造化出力で `{answer}` の形にする。正解したら AI 参加者の得点にする。

### 感想戦 (共通)

- `history` を順番にめくる「review モード」を共通の部品にする。司会者 (リスニング数学ではモニター) が前後に移動する。
