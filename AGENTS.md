# AGENTS.md

オフラインイベントのクイズ企画で使う、LAN 内限定の Web クイズシステム。
司会者・参加者・モニター・問題編集の4画面がリアルタイムに同期する。企画 (mode) はプラグインとして追加する。

- 設計と拡張計画: [docs/design.md](docs/design.md)
- 使い方: [README.md](README.md)
- タスク: GitHub Issues (各 Issue に背景・実装内容・完了条件がある)

## 構成

- `src/shared/` — クライアントとサーバーで共有する純粋なロジック (型、コマンド、企画ごとのルール)。Node や DOM に依存させない
- `src/server/` — Hono + Socket.IO。状態を持つのはサーバーだけで、SQLite にイベントログとスナップショットを保存する
- `src/client/` — React の画面。企画ごとの画面は `src/client/modes/<企画>/`

企画を追加するときは、`src/shared/modes/<企画>/` のルールと `src/client/modes/<企画>/` の画面を書き、それぞれの `registry.ts` に登録する。サーバーのコードは変えなくてよい。

## 開発

エージェント実行環境の非ログインシェルでは Node.js が PATH に入っていない場合があるため、asdf のパスを通す (`export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"`)。

```sh
export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:$PATH"
npm run dev        # 開発サーバー
npm run typecheck  # TypeScript 7
npm run lint       # Biome (npm run format で整形)
npm test           # Vitest
```

## 画面確認・スクリーンショット

ヘッドレス Chrome による画面検証やスクリーンショット撮影を行う際は、コンテナ環境でのスタック防止と安定性のため以下を守る。

- 実行コマンドには必ず `timeout <秒数>` を付与する (例: `timeout 10 ...`)
- Chrome 起動オプション: `--headless --no-sandbox --disable-gpu --disable-dev-shm-usage`
  - `--headless=new` はバックグラウンド処理待機で終了しなくなる場合があるため、旧モード (`--headless`) を使う
- 推奨アプローチ: サーバー起動や Socket 待機を伴う E2E よりも、`renderToStaticMarkup` で静的 HTML を出力し `file://` 経由で撮影する方が高速 (0.1秒台) かつ決定論的に検証できる
- モニター画面の比率維持: `--window-size` 指定時でも内部 viewport が小さくなる場合があるため、`MonitorStage` と同様に `Math.min(window.innerWidth / 1920, window.innerHeight / 1080)` で動的スケールして枠内に収める

## 約束ごと

- TypeScript は Node 24 で直接実行する。enum など型を消すだけでは動かない構文は使わない。相対 import には `.ts` / `.tsx` 拡張子を付ける
- 状態を変える処理は、コマンドとして `apply` に書く。コマンドの適用は外部の状態に依存させない (取り消しはイベントログの再生で実現している)
- ルールを変えたら `src/shared` のテストを足す
- コミットの前に typecheck・lint・test を通す。コミットは作業の区切りごとに行う
- UI の文言、コメント、ドキュメントは日本語で書く
- コマンド実行時はスタック防止のため `timeout` を活用する
