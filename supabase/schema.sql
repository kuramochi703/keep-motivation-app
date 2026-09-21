-- keep-motivation-app のスキーマ（ARCHITECTURE 4章）
--
-- **新しい Supabase プロジェクトに、このファイルを1本流すだけ。**
-- ALTER も DROP も無いので、旧プロジェクトには一切触れない。
-- 切り替わるのは各自が .env を差し替えた瞬間（README 3章）。
--
-- 原則: **記録から計算できるものは保存しない。**
-- 連続サイクル数も気分もステージも records から毎回その場で計算する。
-- 唯一の例外が avatars.seen_stage（進化の演出をどこまで見せたか）。

CREATE TABLE users (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL DEFAULT '',   -- 入力欄は認証と一緒に作る
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id),
  goal        text   NOT NULL,
  -- 目標設定画面が必須にしているので NOT NULL。
  -- 「まだ目標が無い」は deadline の NULL ではなく「goals に行が無い」で表す
  deadline    date   NOT NULL,
  cycle_days  int    NOT NULL DEFAULT 1,  -- サイクル長（README 2章）
  started_at  date   NOT NULL DEFAULT current_date,
  archived_at timestamptz,                -- NULL の最新1件がいまの目標
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE avatars (
  id         bigserial PRIMARY KEY,
  goal_id    bigint NOT NULL UNIQUE REFERENCES goals(id),
  name       text   NOT NULL,             -- 必須入力にしたので DEFAULT を置かない
  hue        int    NOT NULL DEFAULT 150,
  seen_stage int    NOT NULL DEFAULT 0,   -- 0 = まだ何も見せていない（たまご）
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE records (
  id         bigserial PRIMARY KEY,
  goal_id    bigint NOT NULL REFERENCES goals(id),
  done_on    date   NOT NULL,
  minutes    int    NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, done_on)
);

CREATE INDEX goals_current_idx ON goals (user_id, archived_at, id DESC);
CREATE INDEX records_goal_idx  ON records (goal_id, done_on);

-- ユーザーは1行だけ。**id は明示せず連番に任せる**（結果 1 になる）。
-- 明示すると bigserial のシーケンスが進まず、次の INSERT が id=1 で衝突する
INSERT INTO users (name) VALUES ('');
