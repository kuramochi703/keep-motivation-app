# `src/` 構造レビュー

> `src/` の現状・課題・修正案をまとめたメモです。全体のアーキテクチャ図は
> [ARCHITECTURE.md](./ARCHITECTURE.md) を参照してください。

---

## 結論

**部分的にはきれい、全体としては整理しきれていない。**

- `logic.ts`（ルール）と `avatar/`（描画）は、責務が1ファイル/1フォルダに閉じていて良い状態。
- 一方で `src/` 直下がフラットで、フォルダ分けの基準が一貫していない。
- `useApp.ts` が「画面遷移・タイマー・保存」を1つの hook で抱えていて、今後機能が増えるほど肥大化しやすい。
- テストと lint が一切無く、日付計算のような壊れやすいロジックを守る仕組みがない。

規模はまだ小さい（`src` 合計約1,700行）ので、致命的な状態ではありません。ただし
「もう1〜2画面」「もう1人開発者」が増える前に整理しておくと、後が楽になります。

---

## 現状

```text
src/
├── App.tsx            画面切り替え（top/setup/main）
├── useApp.ts           ★状態のリモコン（画面・タイマー・保存を1つにまとめて持つ）
├── logic.ts            ルール（活力計算・達成判定・保存/読込）＋ 型定義
├── Sidebar.tsx          ナビ
├── Logo.tsx             ロゴ
├── Calendar.tsx         達成カレンダー（週表示）
├── MonthlyCalendar.tsx  達成カレンダー（月表示、Calendar.tsx から呼ばれる）
├── calendar.css         ↑2つのスタイル
├── main.tsx             エントリポイント
├── vite-env.d.ts
├── pages/
│   ├── TopPage.tsx
│   ├── SetupPage.tsx
│   ├── MainPage.tsx
│   └── main-page.css   （MainPage専用。SetupPage/TopPageは独自CSSファイルを持たない）
├── ui/
│   ├── styles.css       全体スタイル（変数・共通クラスなどを含む、211行）
│   └── useAccent.ts     活力→アクセントカラー反映（9行）
└── avatar/
    ├── Avatar.tsx        入口（3D/SVGの切り替え）
    ├── AvatarCanvas.tsx  three.js のカメラ・光源
    ├── Chick.tsx         3Dモデルの組み立て
    ├── AvatarSvg.tsx      3D不可時のフォールバック
    ├── look.ts            ステージ×活力→見た目パラメータ
    ├── stage.ts            のべ日数→成長ステージ
    ├── avatar.css
    └── README.md           このフォルダだけの詳しい説明書
```

---

## 良いところ（崩したくない部分）

- **`logic.ts` が唯一のルールブック**になっている。UIから独立した純粋関数で、`State` 型・保存/読込・活力計算がすべてここに集約されている。`useApp.ts` や各ページはこれを呼ぶだけ。
- **`avatar/` は模範的な自己完結モジュール。** 「ステージ/活力→見た目パラメータ（`look.ts`）」と「実際に描く（`Chick.tsx`）」が分離されていて、3D→SVGへのフォールバックも1箇所（`Avatar.tsx`）に閉じている。フォルダ専用の `README.md` まであり、他の人が迷わず触れる。
- **`pages/` は画面単位で素直に分かれている。** `App.tsx` は本当に画面切り替えしかしておらず、状態を持っていない（`ARCHITECTURE.md` の説明通り）。

---

## 課題

### 1. `src/` 直下がフラットで、フォルダ分けの基準がぶれている

`pages/` `avatar/` `ui/` はフォルダにまとまっているのに、`Sidebar.tsx` `Calendar.tsx`
`MonthlyCalendar.tsx` `Logo.tsx` `calendar.css` `useApp.ts` `logic.ts` は直下に置かれている。
「新しい部品をどこに置くか」の判断基準が今はコードを読まないと分からない。

とくに `Calendar.tsx`/`MonthlyCalendar.tsx`/`calendar.css` の3点セットは、
`pages/main-page.css` が `pages/` 配下に同居しているのと比べて扱いが不揃い。

### 2. `useApp.ts` が3つの責務を1つの hook に抱えている

`useApp.ts` は次の3つを同時にやっている。

1. **画面遷移**（`screen` / `go`）
2. **タイマー**（`elapsed` / `running` / `setInterval`）
3. **ドメイン状態の更新と永続化**（`state` / `save()` の呼び出し / `markDone` などの呼び出し）

いまは93行で読めるが、この3つは変化する理由が別々（画面が増える／タイマー仕様が変わる／
保存先が変わる）なので、hookが1つのままだと機能追加のたびに全部に触ることになる。
実際 `INFRA.md` で保存先をSupabaseに移す計画がある — その時に真っ先に肥大化するのがここ。

### 3. テストが一切ない

`logic.ts` は副作用のない純粋関数（`rollover` `markDone` `streak` `daysUntil` など）ばかりで、
本来もっともテストしやすい部分。しかし現状テストコードが存在せず（`package.json` にテストランナーの記載も無い）、
日付境界（月またぎ、`dayOffset` を使ったデバッグ用の日送り、期限当日/翌日など）のバグを
気づかず埋め込みやすい状態になっている。

### 4. lint/format 設定がない

`eslint.config.*` も prettier 設定も無く、`tsconfig.json` の `strict` だけが機械的なチェック。
現状のコードスタイル（引用符・インデント・import順）は統一されているが、それは「守られている」のではなく
「今のところ揃っているだけ」で、人が増えたりAIが書いたりすると簡単に崩れる。

### 5. リポジトリ直下に紛れているファイル

- `keep-motivation-app.tar`（254MB、未追跡）— 誤って生成されたアーカイブに見える。`.gitignore` に無く、このままだと誤ってコミットされうる。
- `test.html`（追跡済み、18KB）— コミット履歴を見ると `src/` 一式の元になったプロトタイプ。今は `src/` が正になっているため、そのまま残すと「どちらが正しいコード？」と誤解を招く。

（`src/` 本体の課題ではないが、`src/` の見通しの良さは足元のリポジトリの整頓具合にも影響するため記載）

---

## 修正案

### A. ディレクトリ構成を機能単位で揃える

```text
src/
├── app/                 ← App.tsx, Sidebar.tsx, main.tsx, vite-env.d.ts
├── pages/               ← 現状維持（TopPage/SetupPage/MainPage + 各CSS）
├── features/
│   └── calendar/        ← Calendar.tsx + MonthlyCalendar.tsx + calendar.css
├── state/               ← useApp.ts を分割したもの（下記B参照）＋ logic.ts
├── avatar/              ← 現状維持（すでに模範的）
└── ui/                  ← styles.css, useAccent.ts, Logo.tsx（見た目の共通部品として統合）
```

一度に全部やる必要はなく、まずは **「直下に置いていいのは `App.tsx`/`main.tsx` などエントリ級だけ」**
というルールを決めて、`Calendar.tsx` 系だけ `features/calendar/` に、`Logo.tsx` は `ui/` に、
という具合に1〜2ファイルずつ動かすので十分。

### B. `useApp.ts` を責務ごとに分割する

```text
useApp.ts            ← 3つを合成するだけの薄い層として残す（画面用の1つのAPIは維持）
├── useScreen.ts      画面遷移（screen/go）
├── useTimer.ts       タイマー（elapsed/running/toggleTimer、5分判定）
└── useGoalState.ts   state本体・save()・markDone等の呼び出し
```

`App.tsx` 側のインターフェース（`useApp()` が返すもの）は変えずに内部だけ分割すれば、
呼び出し側への影響なしにリファクタできる。タイマーの仕様変更や保存先の変更が、
他の2つに波及しなくなる。

### C. `logic.ts` の日付まわりに最小限のテストを追加

フレームワークは軽量なもの（`vitest` など）で十分。優先度順に：

1. `rollover`（月またぎ・複数日サボり・`lastDate` が無い初回起動）
2. `markDone` / `streak`（同日2回呼び出し、連続の途切れ）
3. `daysUntil` / `isExpired`（期限当日・前日・翌日の境界）

ここは`ARCHITECTURE.md`の「動的view」で挙動が図解されている部分でもあるので、
図と対応するテストを書けば仕様書としても機能する。

### D. `eslint` + `prettier` を導入する

`@typescript-eslint` + `eslint-plugin-react-hooks` 程度の最小構成で、
現状すでに守られているスタイル（この後の議論は不要なはず）を機械的に固定するだけで十分。
`npm run build` の前段に `lint` を挟めば、今後スタイルが崩れることを防げる。

### E. リポジトリ直下の掃除

- `keep-motivation-app.tar` は削除し、`.gitignore` に `*.tar` を追加する（誤コミット防止）。
- `test.html` は削除するか、`docs/prototype.html` のような明示的な場所に移して
  「過去のプロトタイプであり `src/` が正」と分かるようにする。

---

## 優先度の目安

| 施策 | 効果 | コスト | 優先度 |
|---|---|---|---|
| E. 直下の掃除（tar削除・test.html整理） | 誤解防止・誤コミット防止 | 低 | 高（すぐやれる） |
| D. eslint/prettier導入 | 今後の劣化防止 | 低 | 高 |
| C. logic.tsのテスト | 日付バグの早期発見 | 中 | 高 |
| A. ディレクトリ整理（`features/calendar/`など） | 見通し向上 | 低〜中 | 中 |
| B. useApp.tsの分割 | 将来の変更コスト低減 | 中 | 中（保存先移行などの前にやるのが理想） |
