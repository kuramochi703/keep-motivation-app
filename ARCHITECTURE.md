# アーキテクチャ図（C4モデル）

> このアプリの仕組みの見取り図です。用語の説明は
> [EXPLAIN.md](./EXPLAIN.md) にあります。このファイルの図は
> GitHub 上で Mermaid 図として自動表示されます。

---

## Level 1: System Context（誰が使うか）

ユーザーと、このアプリ（1個のシステムとして見た場合）の関係です。

```mermaid
flowchart TB
    user["ユーザー（ブラウザ）<br/><i>[Person]</i><br/>毎日の習慣を続けたい人"]
    app["Keep Motivation App<br/><i>[Software System]</i>"]

    user -->|"目標設定・達成の記録・進捗の閲覧"| app

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef focus fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff

    class user person
    class app focus
```

- ユーザーが記録した状態（活力・目標・達成履歴）は、ブラウザの `localStorage` に残るだけで、外部に送信されることはありません。

---

## Level 2: Container（何が動いているか）

「システム」の中身を、実行される単位（コンテナ）に分解した図です。
このアプリはコンテナが2つしかない、非常にミニマルな構成です。

```mermaid
flowchart TB
    user["ユーザー（ブラウザ）<br/><i>[Person]</i>"]

    subgraph system["Keep Motivation App"]
        direction TB
        spa["React SPA<br/><i>[Container: React 19 / TypeScript / Vite]</i><br/>画面の切り替え・タイマー・状態管理を行う<br/>シングルページアプリ"]
        storage[("localStorage<br/><i>[Container: Web Storage API]</i><br/>State（活力・目標・達成日リストなど）を<br/>JSONで保存する")]
    end

    user -->|"操作する（ブラウザで開く）"| spa
    spa -->|"起動時に読込 / 変更のたびに保存<br/>load() / save()"| storage

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef db fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef boundary fill:none,stroke:#444444,stroke-dasharray:5 5,color:#444444

    class user person
    class spa container
    class storage db
    class system boundary
```

- `Vite` はビルド時にだけ使うツールで、実行時のコンテナではないため図には含めていません（`npm run dev` / `build` で SPA を組み立てます）。
- 3D 描画（three.js / react-three-fiber）は独立したコンテナではなく、SPA の中の一部品（Component レベル）として動きます。

---

## Level 3: Component（SPAの中身）

`React SPA` コンテナをさらに分解した図です。「誰が」「どのファイル」を
使って動いているかのつながりに対応します。

```mermaid
flowchart TB
    subgraph spa["React SPA"]
        direction TB

        subgraph shell["画面の骨組み"]
            direction LR
            app["App.tsx<br/><i>[React]</i><br/>画面の設計図。<br/>どの画面を出すか決める"]
            sidebar["Sidebar.tsx<br/><i>[React]</i><br/>メニュー<br/>（トップ/目標設定/ダッシュボード）"]
        end

        subgraph pages["画面"]
            direction LR
            top["TopPage.tsx<br/><i>[React]</i><br/>トップ画面"]
            setup["SetupPage.tsx<br/><i>[React]</i><br/>目標設定画面"]
            main["MainPage.tsx<br/><i>[React]</i><br/>ダッシュボード<br/>（達成ボタン・タイマー・カレンダー）"]
        end

        subgraph parts["表示部品"]
            direction LR
            avatar["avatar/<br/><i>[react-three-fiber + SVG]</i><br/>アバターの3D描画。<br/>WebGL不可なら自動でSVGに切替"]
            calendar["Calendar.tsx /<br/>MonthlyCalendar.tsx<br/><i>[React]</i><br/>達成履歴のカレンダー表示"]
            ui["ui/<br/><i>[CSS + Hook]</i><br/>配色・テーマなどデザインまわり"]
        end

        subgraph core["状態とルール"]
            direction LR
            useapp["useApp.ts<br/><i>[React Hook]</i><br/>リモコン。<br/>全画面の状態とタイマーを1つに管理"]
            logic["logic.ts<br/><i>[TypeScript]</i><br/>ルールブック。活力計算・達成判定・<br/>ロールオーバー・保存/読込"]
        end
    end

    storage[("localStorage<br/><i>[Browser API]</i><br/>保存先")]

    app --> sidebar
    app --> top
    app --> setup
    app --> main

    setup -->|"start() で目標を確定"| useapp
    main -->|"タイマー操作・達成記録"| useapp
    useapp -->|"markDone() / rollover() / save() / load()"| logic
    logic -->|"読み書き（JSON）"| storage

    main -->|"活力・成長段階を渡して描画"| avatar
    top -->|"卵の姿を描画"| avatar
    main -->|"達成日リストを渡して表示"| calendar

    top -->|"配色を利用"| ui
    setup -->|"配色を利用"| ui
    main -->|"配色を利用"| ui

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef db fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef boundary fill:none,stroke:#444444,stroke-dasharray:5 5,color:#444444

    class app,sidebar,top,setup,main,useapp,logic,avatar,calendar,ui component
    class storage db
    class spa,shell,pages,parts,core boundary
```

読み方のポイント:

- **`App.tsx`** は画面遷移だけを担当し、状態そのものは持ちません。
- **`useApp.ts`** が唯一の「状態のリモコン」。タイマーの秒数・実行中かどうか・
  どの画面を出すかをここで管理し、`logic.ts` の関数を呼んで状態を更新します。
- **`logic.ts`** は純粋なルール（活力の増減、サボり判定、日付計算）と
  `localStorage` の読み書きを担当する、UIを持たない層です。
- **`avatar/`** は WebGL が使えれば3D、使えなければ自動でインラインSVGに
  フォールバックします（`Avatar.tsx` 内の `WebGLBoundary` が担当）。

---

## 動的view: 主要な操作の流れ

C4の Context/Container/Component は「静的な構造」を表す図でした。
ここからは「時間の流れ」を示す動的な図（Dynamic Diagram）です。

### 1日のデータの流れ（達成ボタン）

ダッシュボードで「5分はじめる」を 5 分続けたときの流れです。

```mermaid
sequenceDiagram
    autonumber
    actor U as ユーザー
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

### アプリを開いたときのデータの流れ（やつれ判定）

「サボるとやつれる」を実現しているのは、アプリを開いたときに
`logic.ts` の `rollover()` が行う計算です。

```mermaid
sequenceDiagram
    autonumber
    participant B as ブラウザ
    participant R as useApp.ts
    participant L as logic.ts
    participant S as localStorage
    participant M as MainPage.tsx

    B->>R: アプリを開く
    R->>S: load() でセーブデータを読む
    S-->>R: 保存されていた State
    R->>L: rollover() でサボった日を判定
    L-->>R: 1日サボりごとに 活力 -20
    R->>M: やつれたアバターを表示
    M-->>B: 痩せた絵と「もう…」のセリフ
```

---

---

## データモデル（保存される内容）

`logic.ts` の `State` が持つデータです。`localStorage` に JSON として
1件だけ書き込まれます（ユーザーごとの分岐やIDはありません）。

| 項目 | 型 | 意味 | 例 |
|---|---|---|---|
| `vitality` | `number` | 活力（0〜100）。達成で +12、1日サボるごとに -20 | `64` |
| `goal` | `string` | 目標 | `"資格の勉強"` |
| `deadline` | `string` | 期限（`YYYY-MM-DD`）。過ぎると振り返り画面へ | `"2026-03-31"` |
| `frequency` | `Frequency` | 取り組む頻度（下表） | `"毎日"` |
| `avatarId` | `number` | アバターの種類 | `0` |
| `name` | `string` | アバターの名前 | `"もりお"` |
| `done` | `string[]` | 達成日のリスト（`YYYY-MM-DD` の配列） | `["2026-03-01", ...]` |
| `best` | `number` | 最長記録（いちばん長く続いた連続日数） | `12` |

**`avatarId` の対応**： `0` = もりお / `1` = だいち / `2` = こむぎ

**`frequency` に入る値**： `毎日` / `週3回` / `週1回` / `決めてない`

### 保存されている JSON の例

```json
{
  "vitality": 64,
  "goal": "資格の勉強",
  "deadline": "2026-03-31",
  "frequency": "毎日",
  "avatarId": 0,
  "name": "もりお",
  "done": ["2026-03-01", "2026-03-02", "2026-03-04"],
  "best": 12
}
```

> `done` と `vitality` だけが日々更新され、残りは目標設定時に決まります。
> サボり判定（`rollover()`）は `done` の最終日と今日の差分から計算されます。