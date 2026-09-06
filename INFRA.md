# インフラ構成 — 何をどこに置くか

企画時点の想定は「React + Supabase + Google Cloud Run」でしたが、
**Cloud Run はやめて静的ホスティングにする**ことを提案します。理由と手順をまとめます。

チームの進め方は [TEAM.md](./TEAM.md)、環境構築は [README.md](./README.md) を参照。

---

## 1. 構成

```text
ブラウザ ──▶ 静的ホスティング（HTML/JS/CSS を配るだけ）
   │
   └──────▶ Supabase（DB / 認証 / API）
```

| 層 | 使うもの | 役割 |
| --- | --- | --- |
| フロント | React + Vite | 画面。`npm run build` で静的ファイルになる |
| ホスティング | Firebase Hosting | ビルド結果を配信するだけ |
| DB・認証・API | Supabase | データ保存、ログイン、他人とつながる機能 |
| 自前バックエンド | **なし** | Supabase が代わりを務める |

---

## 2. なぜ Cloud Run ではなく静的ホスティングか

Cloud Run は「**常駐するサーバープロセス**」を動かすための場所です。
このアプリのフロントは `npm run build` すると **ただの HTML / JS / CSS** になり、動かすものがありません。
DB アクセスも認証も Supabase がやるので、間に立つサーバーが不要です。

| | 静的ホスティング | Cloud Run |
| --- | --- | --- |
| 必要な作業 | `build` して `deploy` の2コマンド | Dockerfile、Artifact Registry、IAM など |
| 費用 | 無料枠で足りる | 従量課金（要クレカ登録） |
| 速度 | CDN から即配信 | コールドスタートあり |
| このアプリでの利点 | — | **無し**（動かすサーバーが無いため） |

**Cloud Run が必要になるのは**、Supabase では書けない処理（外部APIの鍵を隠して叩く、重いバッチ、定期通知）が出てきた時です。
その時も多くは Supabase Edge Functions で足ります。**今は入れない。**

### なぜ Firebase Hosting か

無料枠・CDN・HTTPS 自動・カスタムドメインが揃っていて、GCP と同じ Google アカウントで完結するため
（企画時の「サーバー: Google Cloud」の意図を、一番安く満たせる）。
Vercel / Cloudflare Pages / GitHub Pages でも問題ありません。**乗り換えは後からでも数十分でできます。**

---

## 3. やること（着手時のチェックリスト）

決まっていないことが多いので、**上から順に、必要になった時点で**進めてください。

### 3-1. Supabase を用意する

- [ ] Supabase でプロジェクト作成（無料枠、リージョンは Tokyo）
- [ ] テーブル設計（最低限：`users` / `records`＝日ごとの達成記録）
- [ ] RLS（行レベルセキュリティ）を有効にする ← **他人のデータが読めてしまう事故を防ぐ。必須**
- [ ] `npm i @supabase/supabase-js`

### 3-2. 環境変数

- [ ] `.env.local` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を書く
- [ ] `.env*` を `.gitignore` に入れる（**鍵を Git に push しない**）
- [ ] `.env.example` をキー名だけ書いて共有する
- [ ] 3人への鍵の渡し方を決める（チャットの DM など。リポジトリには置かない）

> anon key はブラウザに露出する前提の鍵なので、漏れても RLS があれば守られます。
> **逆に言うと RLS が無いと全データが読み書きされます。** 3-1 のチェックを飛ばさないこと。

### 3-3. デプロイ

- [ ] `npm i -g firebase-tools` → `firebase login` → `firebase init hosting`
      （公開ディレクトリは `dist`、SPA 設定は「Yes」）
- [ ] `npm run build && firebase deploy` で公開できることを確認
- [ ] GitHub Actions で main マージ時に自動デプロイ（余裕が出てから）

---

## 4. 移行の順番（重要）

**いきなり Supabase に切り替えないでください。** 今は localStorage で完結していて、それで動いています。

```text
① localStorage のまま、まず公開する（デプロイの手順を通す）
        ↓
② Supabase に保存先を移す（1人で使う分の機能は変えない）
        ↓
③ ログインを足す
        ↓
④ 他人とつながる機能
```

①と②を同時にやると、**壊れた時にホスティングのせいか DB のせいか分からなくなります。**
一度に変えるのは1つだけ。
