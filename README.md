# summercamp-quiz

オフラインイベントのクイズ企画で使う、LAN 内限定のクイズシステムです。
司会者・参加者・モニター・問題編集の各画面がブラウザで動き、リアルタイムに同期します。

設計と今後の拡張計画は [docs/design.md](docs/design.md) を、進捗は [Issues](https://github.com/hakatashi/summercamp-quiz/issues) を見てください。

## 対応している企画

| 企画 | 状態 |
|---|---|
| シンプル早押しクイズ | 本戦を実装済み (感想戦は未実装) |
| 早押しクイズ (ボード付き) | 未実装 |
| リスニング数学 | 未実装 |
| イラスト回文クイズ | 未実装 |

## 必要なもの

- Node.js 24 以上 (TypeScript を直接実行し、組み込みの `node:sqlite` を使います)

## 使い方

```sh
npm install

# 開発 (Vite: http://<このPCのIP>:47352/ 、API サーバー: 38421 番)
npm run dev

# 本番 (ビルドしてから、38421 番の1つのポートで配信)
npm run build
HOST_PASSWORD=ひみつ npm start
```

起動すると、LAN 内の他の端末からアクセスするための URL が表示されます。

### 環境変数

| 名前 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `38421` | サーバーのポート (開発時は Vite の proxy 先にもなる) |
| `HOST_PASSWORD` | なし | 司会者画面・問題編集・ゲーム管理のパスワード。未設定なら誰でも開ける |
| `DATA_DIR` | `data` | SQLite のデータベースを置くディレクトリ |

### ngrok で公開する

```sh
# 開発サーバーの場合
ngrok http 47352

# 本番 (npm start) の場合
ngrok http 38421
```

開発サーバーでは、Vite が許可したホスト名以外からのアクセスを拒否します。ngrok のドメイン (`*.ngrok-free.app` など) は許可済みです。
それ以外のドメインを使うときは、環境変数 `ALLOWED_HOSTS` にカンマ区切りで指定してください (例: `ALLOWED_HOSTS=.example.com npm run dev`)。

### 画面

| URL | 画面 | 想定する端末 |
|---|---|---|
| `/` | ゲーム一覧 | |
| `/admin` | ゲームの作成・削除 | PC |
| `/games/:id/host` | 司会者 | PC |
| `/games/:id/play` | 参加者 (初回は名前を登録) | スマホ / PC |
| `/games/:id/monitor` | モニター (16:9 の全画面) | 会場のテレビ |
| `/games/:id/edit` | 問題編集 | PC |

### シンプル早押しクイズの流れ

1. `/admin` でゲームを作り、問題編集画面で問題を登録する (スプレッドシートから「問題文・答え・メモ」を貼り付けて一括登録できる)。
2. 参加者は `/games/:id/play` で名前を登録する。早押しボタンはタップのほか、PC では Enter / Space キーでも押せる。
3. 司会者は「次の問題を出題」(N キー) → 押した人を「正解」(O キー) /「誤答」(X キー) で判定する。
4. 間違えた操作は、画面右上の「取り消し」で1つずつ戻せる。得点の直接編集、押下のリセット、出題の取り消しもできる。

## 開発

```sh
npm run typecheck   # TypeScript 7 (tsc) で型チェック
npm run lint        # Biome
npm run format      # Biome で整形
npm test            # Vitest
```

### 構成

- `src/shared/`: クライアントとサーバーで共有する型、コマンド、企画ごとのルール (純粋関数)
- `src/server/`: Hono + Socket.IO のサーバーと、SQLite (イベントログ + スナップショット) による永続化
- `src/client/`: React の画面。企画ごとの画面は `src/client/modes/<企画>/` に置く

新しい企画を追加する手順は [docs/design.md](docs/design.md#game-と-mode) にあります。
