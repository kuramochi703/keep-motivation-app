# はじめてのためのガイド

「サボると、やつれる。」— 机に向かった日を記録すると、サボった日数だけアバターがやつれていく習慣化アプリ。

---

## 1. 何が動いているのか（30秒で把握）

このアプリは **いまのところブラウザだけで完結** します。サーバーもデータベースもありません。
（将来的に保存先を Supabase へ移す予定です → [INFRA.md](./INFRA.md)）

```text
ソースコード (src/)  ──[Vite]──▶  ブラウザで表示
記録データ            ──────────▶  ブラウザの localStorage に保存
```

- **Vite（ヴィート）**: 書いたコードをブラウザが読める形に変換して、開発用サーバーで配る道具。
- **React**: 画面を「部品（コンポーネント）」の組み合わせで作るライブラリ。
- **TypeScript**: JavaScript に型チェックを足したもの。書き間違いを保存時に教えてくれる。
- **localStorage**: ブラウザに内蔵された保存領域。データは各自のブラウザにしか残らないので、**他の人の記録は見えません**（今のところ）。

---

## 2. 環境構築（初回だけ）

### 2-1. Node.js を入れる

このプロジェクトは **Node.js v20 以上**（推奨 v22 / v24）で動きます。

まず入っているか確認：

```bash
node -v
npm -v
```

`command not found` と出たら、[nodejs.org](https://nodejs.org/) の **LTS 版**をインストールしてください。
（Mac で Homebrew が使えるなら `brew install node` でも可）

### 2-2. リポジトリを持ってくる

```bash
git clone https://github.com/kuramochi703/keep-motivation-app.git
cd keep-motivation-app
```

### 2-3. ライブラリを入れる

```bash
npm install
```

`package.json` に書かれたライブラリ一式が `node_modules/` にダウンロードされます。
**数分かかることがあります。** `node_modules/` は Git に含めない（`.gitignore` 済み）ので、各自の PC で 1 回ずつ実行します。

### 2-4. 起動する

```bash
npm run dev
```

こう表示されたら成功です：

```text
  ➜  Local:   http://localhost:5173/
```

ブラウザで **<http://localhost:5173/>** を開いてください。
止めるときはターミナルで `Ctrl + C`。

---

## 3. 毎日の作業の流れ

```bash
git pull            # ① 他の人の変更を取り込む
npm install         # ② package.json が変わっていた時だけ
npm run dev         # ③ サーバーを起動（作業中はつけっぱなし）
# → コードを編集すると、保存した瞬間にブラウザへ反映されます（HMR）
git add -A
git commit -m "何をしたか"
git push            # ④ 共有する
```

**ポイント**: 開発サーバーは起動しっぱなしで OK です。ファイルを保存するたびに画面が自動で更新されるので、再起動は不要です。

---

## 4. コマンド一覧

| コマンド | 何をするか | いつ使うか |
| --- | --- | --- |
| `npm install` | ライブラリを入れる | 初回 / `package.json` が変わった時 |
| `npm run dev` | 開発サーバー起動（自動リロード付き） | 開発中ずっと |
| `npm run build` | 本番用に書き出し＋型チェック | push する前の確認 |
| `npm run preview` | `build` した結果を確認 | 本番の見た目を確かめたい時 |

**push する前に `npm run build` が通ることを確認してください。** 型エラーがあるとここで落ちます。

---

## 5. ファイルの役割

```text
index.html          入口のHTML（基本さわらない）
src/
  main.tsx          Reactの起動処理（基本さわらない）
  App.tsx           画面の中身と、ボタン・タイマーの動き  ← UI変更はここ
  Avatar.tsx        アバターのSVG（見た目の絵そのもの）    ← 絵の変更はここ
  logic.ts          活力の計算・連続日数・保存/読込        ← ルール変更はここ
  styles.css        全体の見た目                          ← 色やレイアウトはここ
test.html           元になった1ファイル版のプロトタイプ（参照用）
```

**迷ったら**: 「見た目を変えたい」→ `styles.css` か `App.tsx`。「ルール（活力の増減など）を変えたい」→ `logic.ts`。

### ゲームのルール（`logic.ts` の定数）

| 定数 | 値 | 意味 |
| --- | --- | --- |
| `GAIN` | 12 | 達成した日に増える活力 |
| `DECAY` | 20 | サボった日に減る活力 |
| `SESSION` | 300 | タイマーの秒数（5分） |

---

## 6. Git の進め方（3人で作業するとき）

同じファイルを同時に触ると衝突（コンフリクト）します。おすすめの進め方：

```bash
git switch -c feat/やること名   # ブランチを作って作業
# ...編集...
git add -A && git commit -m "..."
git push -u origin feat/やること名
# → GitHub上でプルリクエストを作り、他の2人が見てからmainへ入れる
```

- 作業前に必ず `git switch main && git pull` で最新にする
- 1つのブランチでは1つのことだけやる（レビューが楽になる）
- **担当ファイルを分ける**のが衝突を避ける一番の近道です（例: Aさん=`logic.ts`、Bさん=`App.tsx`、Cさん=`styles.css`）

---

## 7. 困ったときは

| 症状 | 対処 |
| --- | --- |
| `npm: command not found` | Node.js が未インストール → 2-1 へ |
| `Cannot find module 'react'` など | `npm install` を実行し忘れ |
| ポート 5173 が使用中 | 別のターミナルで起動しっぱなし。`Ctrl+C` で止めるか `npm run dev -- --port 5174` |
| 画面が真っ白 | ブラウザで `F12` → Console タブの赤いエラーを読む |
| 保存した記録を消したい | 画面下の「最初から」ボタン、または `F12` → Application → Local Storage を削除 |
| どうにもならない | `rm -rf node_modules package-lock.json && npm install` で入れ直し |

**WSL / Windows の人へ**: WSL 内で `npm run dev` した場合、通常は
Windows 側のブラウザから `<http://localhost:5173/>` で開けます。
開けない場合は `npm run dev -- --host` で起動し、表示された Network アドレスを使ってください。
