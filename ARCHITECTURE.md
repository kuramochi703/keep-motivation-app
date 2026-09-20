# アーキテクチャ — 何がどう動いているか

このアプリの見取り図です。**構成・データの持ち方・置き場所・既知の課題**をまとめています。
アプリの機能と環境構築は [README.md](./README.md)、分担とルールは [TEAM.md](./TEAM.md) を参照。

> 図は GitHub 上で Mermaid として自動表示されます。

---

## 1. 全体像

### 誰が使うか（C4: System Context）

```mermaid
flowchart TB
    user["ユーザー（ブラウザ）<br/><i>[Person]</i><br/>毎日の習慣を続けたい人"]
    app["Keep Motivation App<br/><i>[Software System]</i>"]
    sb["Supabase<br/><i>[External System]</i><br/>DB（目標・状態の保存）"]

    user -->|"目標設定・達成の記録・進捗の閲覧"| app
    app -->|"読み書き（HTTPS）"| sb

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef focus fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff

    class user person
    class app focus
    class sb external
```

### 何が動いているか（C4: Container）

```mermaid
flowchart TB
    user["ユーザー（ブラウザ）<br/><i>[Person]</i>"]

    subgraph system["Keep Motivation App"]
        spa["React SPA<br/><i>[React 19 / TypeScript / Vite]</i><br/>画面・タイマー・状態管理。<br/>build すると静的ファイルになる"]
    end

    sb[("Supabase<br/><i>[PostgreSQL / REST]</i><br/>goals / user_state")]

    user -->|"ブラウザで開く"| spa
    spa -->|"起動時に読込 / 変更のたびに保存<br/>@supabase/supabase-js"| sb

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef boundary fill:none,stroke:#444444,stroke-dasharray:5 5,color:#444444

    class user person
    class spa,sb container
    class system boundary
```

- **自前のバックエンドはありません。** `npm run build` すると HTML / JS / CSS になるだけで、
  常駐するサーバープロセスがありません。DB アクセスは Supabase が直接受けます
- `Vite` はビルド時だけの道具なので、実行時のコンテナとしては描いていません
- 3D 描画（three.js）は独立したコンテナではなく、SPA の中の一部品です

---

## 2. `src/` の構造

```text
src/
├── main.tsx                    エントリポイント。App を描画する
├── vite-env.d.ts               Vite の型定義
│
├── app/                        画面の骨組み
│   ├── App.tsx                   どの画面を出すか決める。状態は持たない
│   └── Sidebar.tsx               メニュー（トップ/目標設定/ダッシュボード）
│
├── pages/                      画面（1画面 = 1ファイル）
│   ├── TopPage.tsx               トップ
│   ├── SetupPage.tsx             目標設定
│   ├── MainPage.tsx              ダッシュボード
│   ├── main-page.css
│   └── onboarding-page.css
│
├── features/
│   └── calendar/               カレンダー機能一式
│       ├── Calendar.tsx          週表示（達成率・連続日数の集計もここ）
│       ├── MonthlyCalendar.tsx   月表示（Calendar.tsx から呼ばれる）
│       └── calendar.css
│
├── state/                      状態とルール
│   ├── useApp.ts                 合成層。下の3つを1つのAPIにまとめる
│   ├── useScreen.ts              画面遷移だけ
│   ├── useTimer.ts               5分タイマーだけ
│   ├── useGoalState.ts           目標の状態管理と Supabase の読み書き
│   └── logic.ts                  ルールブック。活力計算・達成判定・日付計算
│
├── lib/
│   └── supabase.ts             DB の接続クライアント
│
├── avatar/                     アバターの3D描画 → README.md に詳細
│   ├── Avatar.tsx / AvatarCanvas.tsx / Chick.tsx
│   ├── look.ts / stage.ts / avatar.css
│   ├── models/                   chick.blend / chick.glb / export_glb.py
│   └── docs/                     Blender の作業メモ
│
└── ui/                         見た目の共通部品
    ├── Logo.tsx / useAccent.ts / styles.css
```

### つながり（C4: Component）

```mermaid
flowchart TB
    subgraph spa["React SPA"]
        direction TB

        subgraph shell["app/（骨組み）"]
            direction LR
            app["App.tsx<br/>どの画面を出すか決める"]
            sidebar["Sidebar.tsx<br/>メニュー"]
        end

        subgraph pages["pages/（画面）"]
            direction LR
            top["TopPage.tsx"]
            setup["SetupPage.tsx"]
            main["MainPage.tsx"]
        end

        subgraph parts["表示部品"]
            direction LR
            avatar["avatar/<br/><i>[react-three-fiber]</i><br/>3Dのひよこ。<br/>WebGL不可なら空枠のみ"]
            calendar["features/calendar/<br/>達成履歴のカレンダー"]
            ui["ui/<br/>配色・ロゴ"]
        end

        subgraph core["state/（状態とルール）"]
            direction LR
            useapp["useApp.ts<br/>合成層"]
            usescreen["useScreen.ts<br/>画面遷移"]
            usetimer["useTimer.ts<br/>5分タイマー"]
            usegoal["useGoalState.ts<br/>目標の状態と永続化"]
            logic["logic.ts<br/>ルールブック"]
        end

        client["lib/supabase.ts<br/>接続クライアント"]
    end

    db[("Supabase<br/>goals / user_state")]

    app --> sidebar
    app --> top
    app --> setup
    app --> main

    setup -->|"start() で目標を確定"| useapp
    main -->|"タイマー操作・達成記録"| useapp
    useapp --> usescreen
    useapp --> usetimer
    useapp --> usegoal
    usetimer -->|"300秒たったら onComplete()"| usegoal
    usetimer -->|"SESSION を参照"| logic
    usegoal -->|"markDone() / rollover() / resetGoal()"| logic
    usegoal --> client
    client -->|"select / insert / update / upsert"| db

    main -->|"活力・のべ達成日数を渡す"| avatar
    top -->|"たまごの姿を描画"| avatar
    main -->|"達成日リストを渡す"| calendar

    top --> ui
    setup --> ui
    main --> ui
    sidebar --> ui

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef dbx fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef boundary fill:none,stroke:#444444,stroke-dasharray:5 5,color:#444444

    class app,sidebar,top,setup,main,useapp,usescreen,usetimer,usegoal,logic,avatar,calendar,ui,client component
    class db dbx
    class spa,shell,pages,parts,core boundary
```

読み方のポイント:

- **`App.tsx` は画面遷移だけ**を担当し、状態そのものは持ちません
- **`useApp.ts` は唯一の「状態のリモコン」**ですが、中身は3つの hook の合成層です。
  分けている理由は**変化する理由が別々**だから（画面が増える／タイマー仕様が変わる／保存先が変わる）。
  `useApp()` が返す API は分割前と同じなので、呼び出し側はこの分割を意識しなくて済みます
- **`logic.ts` は UI を持たない純粋なルール**（活力の増減、サボり判定、日付計算）。
  3つの hook はここの定数・関数を呼ぶだけで、ロジックそのものは持ちません
- **`avatar/` の見た目は3Dの一種類だけ**です。WebGL が使えない／初期化に失敗した場合は、
  レイアウトを保つための空枠だけが残ります（`Avatar.tsx` の `WebGLBoundary`）
- **`features/calendar/`** は機能ひとまとまりの置き場。機能が増えたら `features/` にフォルダを足します

---

## 3. データの流れ

### 5分やりきったとき

```mermaid
sequenceDiagram
    autonumber
    actor U as ユーザー
    participant M as MainPage.tsx
    participant T as useTimer.ts
    participant G as useGoalState.ts
    participant L as logic.ts
    participant S as Supabase

    U->>M: ▶ を押す
    M->>T: タイマー開始（useApp() 経由）
    T->>T: 300秒たったら達成と判定
    T->>G: onComplete()（markSessionDone）
    G->>L: markDone(state)
    L-->>G: 活力 +12 / 達成日を記録
    G->>S: user_state を id=1 で UPSERT
    G-->>M: 新しい状態で再描画
    M-->>U: 「今日はもう積んだ」と表示
```

（`useApp.ts` はこの呼び出しを配線する合成層で、図では省略しています。
「記録だけつける」ボタンは、タイマーを飛ばして `markSessionDone` を直接呼ぶ同じ流れです。）

### アプリを開いたとき（やつれ判定）

```mermaid
sequenceDiagram
    autonumber
    participant B as ブラウザ
    participant G as useGoalState.ts
    participant S as Supabase
    participant L as logic.ts
    participant M as MainPage.tsx

    B->>G: アプリを開く
    G->>S: user_state(id=1) と 関連する goals を取得
    S-->>G: 保存されていた状態
    G->>L: rollover() でサボった日を判定
    L-->>G: 1日サボりごとに 活力 -20
    G-->>M: やつれたアバターを表示
    M-->>B: 色が抜けてうつむいた絵と「もう…」のセリフ
```

---

## 4. データモデル

接続クライアントは [`src/lib/supabase.ts`](./src/lib/supabase.ts)、読み書きは
[`src/state/useGoalState.ts`](./src/state/useGoalState.ts) に閉じています。
環境変数は [`.env.example`](./.env.example) を参照。

```mermaid
flowchart LR
    S["user_state.goal_id"] -->|現在の目標を参照| G["goals.id"]
```

> 以下の型は**アプリ側の型**です。DDL / マイグレーションはリポジトリに無いため、
> SQL の型・主キー・NULL 制約・デフォルト値・インデックス・RLS ポリシーは未確認です。

### `goals` — 目標

| カラム | アプリ上の型 | 内容 |
| --- | --- | --- |
| `id` | `number` | 目標ID。作成時は送らず、返ってきた値を使う |
| `goal` | `string` | 目標の文章 |
| `deadline` | `string` / `null` | 期限（`YYYY-MM-DD`） |
| `frequency` | `Frequency` | `everyday` / `week3` / `week1` / `any`（表示名: 毎日 / 週3回 / 週1回 / 決めてない） |

### `user_state` — 現在の状態

| カラム | アプリ上の型 | 内容 |
| --- | --- | --- |
| `id` | `number` | **現在は `1` 固定** |
| `goal_id` | `number` / `null` | 取り組んでいる目標のID |
| `vitality` | `number` | 活力（0〜100） |
| `avatar_id` | `0` / `1` / `2` | もりお / だいち / こむぎ |
| `name` | `string` | アバターの名前 |
| `done` | `string[]` | 達成日リスト（`YYYY-MM-DD`） |
| `best` | `number` | 最長連続達成日数 |

### 読み書きの対応

| 操作 | DBへの処理 | アプリ側 |
| --- | --- | --- |
| 起動 | `user_state`(id=1) を `maybeSingle()`。関連 `goals` も同時取得 | State に変換し `rollover()` を適用 |
| 目標作成 | `goals` に INSERT して `id` を得る | 活力50・履歴空・最長記録0 にリセット |
| 状態保存 | `user_state` を id=1 で UPSERT | `loaded && hasStarted` のとき変更に応じて |
| 今日の達成 | 状態保存を通じて更新 | 達成日を追加し活力 +12。同日の重複は加算しない |
| 次の日へ進める | 状態保存を通じて更新 | 日付を進め、未達成日ぶん活力 -20 |
| 期限延長 | `goals.deadline` を UPDATE | 成功後に画面の期限を1か月延長 |
| 目標の作り直し | **書き換えない** | `hasStarted=false` にして設定画面へ |
| 全体リセット | **削除しない** | ローカルの状態を初期値に戻す |

### 初期値と補完

アプリ側の値であり、DB のデフォルト値ではありません。

| 項目 | 起動時 | DB値が null の場合 | 目標作成成功時 |
| --- | --- | --- | --- |
| `vitality` | `62` | `100` | `50` |
| `goalId` | `null` | `null` | 作成された目標ID |
| `goal` | `資格の勉強` | 空文字 | 入力値 |
| `deadline` | `null` | `null` | 入力値 |
| `frequency` | `any` | `any` | 入力値 |
| `avatarId` | `0` | `0` | 入力値 |
| `name` | `もりお` | 空文字 | 入力値 |
| `done` / `best` | `[]` / `0` | `[]` / `0` | `[]` / `0` |

### DBに保存していないもの

| 項目 | 用途 | 再読み込み時 |
| --- | --- | --- |
| `lastDate` | 最後に日付更新を処理した日 | `null` に戻り、読み込み時の `rollover()` で当日を設定 |
| `dayOffset` | デバッグ用の日送り | `0` に戻る |
| `loaded` / `hasStarted` | 読み込み・開始状況 | hook 内で再設定 |
| 画面・タイマーの状態 | 現在の画面、経過秒数 | 保存していない |

---

## 5. 既知の制約・課題

**データまわり**

- **ユーザーの区別がありません。** すべての操作が `user_state.id = 1` を対象にします。
  認証と RLS（行レベルセキュリティ）を入れるまで、**誰が開いても同じデータ**です
- **`lastDate` を保存していない**ため、再読み込みをまたいだ未達成日数による活力減少を
  正しく再現できません
- **目標を作り直しても古い `goals` は残ります。** 一方で達成履歴は `user_state.done` の
  1本だけなので、**過去の目標ごとの履歴は残りません**
- 目標作成の INSERT と状態保存の UPSERT は別々の非同期処理です。
  **目標作成の成功は、状態保存の完了を意味しません**（失敗時は Console にエラー）

**コードまわり**

- **テストが1つもありません。** `logic.ts` は副作用のない純粋関数ばかりで本来いちばん
  テストしやすい部分です。とくに `rollover`（月またぎ・複数日サボり）・`streak`（同日2回、
  連続の途切れ）・`daysUntil` / `isExpired`（期限の当日・前日・翌日）は手で確認しづらく、
  3節のシーケンス図と対応するテストを書けば仕様書としても働きます
- **lint / format 設定がありません。** いまスタイルが揃っているのは「守られている」のではなく
  「たまたま揃っている」状態です

---

## 6. どこに置くか（デプロイ）

企画時点の想定は「React + Supabase + Google Cloud Run」でしたが、
**Cloud Run はやめて静的ホスティングにする**方針です。

```text
ブラウザ ──▶ 静的ホスティング（HTML/JS/CSS を配るだけ）
   │
   └──────▶ Supabase（DB / 認証 / API）
```

### なぜ Cloud Run ではないか

Cloud Run は**常駐するサーバープロセス**を動かす場所です。このアプリのフロントは
`build` すればただの静的ファイルで、動かすものがありません。DB も認証も Supabase が
受けるので、間に立つサーバーが不要です。

| | 静的ホスティング | Cloud Run |
| --- | --- | --- |
| 必要な作業 | `build` して `deploy` の2コマンド | Dockerfile、Artifact Registry、IAM など |
| 費用 | 無料枠で足りる | 従量課金（要クレカ登録） |
| 速度 | CDN から即配信 | コールドスタートあり |
| このアプリでの利点 | — | **無し** |

**Cloud Run が要るのは**、Supabase では書けない処理（外部APIの鍵を隠して叩く、重いバッチ、
定期通知）が出てきた時です。その多くは Supabase Edge Functions で足ります。**今は入れない。**

### 公開の手順（着手時）

- [ ] RLS（行レベルセキュリティ）を有効にする ← **他人のデータが読めてしまう事故を防ぐ。必須**
- [ ] `npm i -g firebase-tools` → `firebase login` → `firebase init hosting`
      （公開ディレクトリは `dist`、SPA 設定は「Yes」）
- [ ] `npm run build && firebase deploy` で公開できることを確認
- [ ] GitHub Actions で main マージ時に自動デプロイ（余裕が出てから）

> anon key はブラウザに露出する前提の鍵なので、漏れても RLS があれば守られます。
> **逆に言うと RLS が無いと全データが読み書きされます。** 1つ目のチェックを飛ばさないこと。

Firebase Hosting を選ぶ理由は、無料枠・CDN・HTTPS 自動・カスタムドメインが揃っていて
Google アカウントで完結するためです。Vercel / Cloudflare Pages / GitHub Pages でも問題なく、
**乗り換えは後からでも数十分でできます。**
