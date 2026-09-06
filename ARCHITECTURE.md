# アーキテクチャ図

> このアプリの仕組みの見取り図です。用語の説明は
> [EXPLAIN.md](./EXPLAIN.md) にあります。このファイルの図は
> GitHub 上で Mermaid 図として自動表示されます。

---

## 1. 全体構成

「誰が」「どのファイル」を使って動いているかのつながりです。

```mermaid
flowchart TD
  U[ユーザー]
  B[ブラウザ]
  Vite[Vite ビルド]
  App[App.tsx 画面の設計図]
  SB[Sidebar.tsx メニュー]
  RA[useApp.ts リモコン]
  LG[logic.ts ルールブック]
  ST[(localStorage セーブ)]
  TP[TopPage.tsx トップ]
  SP[SetupPage.tsx 目標設定]
  MP[MainPage.tsx ダッシュボード]
  AV[avatar/ アバターの絵 3D]
  UI[ui/ デザイン]

  U --> B
  Vite --> B
  B --> App
  App --> SB
  App --> TP
  App --> SP
  App --> MP
  SP --> RA
  MP --> RA
  RA --> LG
  LG --> ST
  MP --> AV
  TP --> AV
  TP --> UI
  SP --> UI
  MP --> UI
```

- `App.tsx` が「どの画面を出すか」を決める設計図
- `useApp.ts` がリモコンとなり、全画面の状態を1つに管理
- `logic.ts` がルールを計算し、`localStorage` が記録を保存
- `pages/` と `avatar/` と `ui/` が画面と絵とデザインを担当

---

## 2. 1日のデータの流れ（達成ボタン）

ダッシュボードで「5分はじめる」を 5 分続けたときの流れです。

```mermaid
sequenceDiagram
  participant U as ユーザー
  participant M as MainPage.tsx
  participant R as useApp.ts
  participant L as logic.ts
  participant S as localStorage

  U->>M: 「5分はじめる」を押す
  M->>R: タイマー開始
  R->>R: 300秒たったら達成と判定
  R->>L: markDone(state)
  L-->>R: 活力 +12 / 達成日を記録
  R->>S: save(state)
  R->>M: 新しい状態で再描画
  M-->>U: 「今日はもう積んだ」と表示
```

---

## 3. アプリを開いたときのデータの流れ（やつれ判定）

「サボるとやつれる」を実現しているのは、アプリを開いたときに
`logic.ts` の `rollover()` が行う計算です。

```mermaid
sequenceDiagram
  participant B as ブラウザ
  participant R as useApp.ts
  participant L as logic.ts
  participant S as localStorage
  participant M as MainPage.tsx

  B->>R: アプリを開く
  R->>S: load(セーブデータを読む)
  R->>L: rollover(サボった日を判定)
  L-->>R: 1日サボりごとに 活力 -20
  R->>M: やつれたアバターを表示
  M-->>B: 痩せた絵と「もう…」のセリフ
```

---

## 4. 記録の持ち方（データモデル）

`logic.ts` の `State` が持つデータのイメージです。保存形式は
`localStorage` に JSON として書き込まれます。

```text
State {
  活力 (vitality)     0〜100 の数字
  目標 (goal)         文字列。例「資格の勉強」
  期限 (deadline)     YYYY-MM-DD。過ぎると振り返り画面
  頻度 (frequency)    毎日 / 週3回 / 週1回 / 決めてない
  アバター種 (avatarId) 0=もりお 1=だいち 2=こむぎ
  名前 (name)         アバターの名前
  達成日リスト (done)  やった日の日付の一覧
  最長記録 (best)      いちばん長く続いた連続日数
}
```
