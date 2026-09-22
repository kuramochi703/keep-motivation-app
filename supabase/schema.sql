-- keep-motivation-app のスキーマ（ARCHITECTURE 4章）
--
-- **新しい Supabase プロジェクトに、このファイルを1本流すだけ。**
-- ALTER も DROP も無いので、旧プロジェクトには一切触れない。
-- 切り替わるのは各自が .env を差し替えた瞬間（README 3章）。
--
-- 原則: **記録から計算できるものは保存しない。**
-- 連続サイクル数も気分もステージも records から毎回その場で計算する。
-- 唯一の例外が avatars.seen_stage（進化の演出をどこまで見せたか）。
--
-- 持ち主は `auth.users`（Supabase Auth）。public に users テーブルは置かない。
-- パスワードのハッシュは auth.users.encrypted_password にあり、照合は Supabase 内で完結する。
-- アカウントは管理画面の Authentication → Users で手作業で配る（登録画面は無い）。

CREATE TABLE goals (
  id          bigserial PRIMARY KEY,
  user_id     uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- RLS（ARCHITECTURE 4章）
--
-- anon key はブラウザに配られるので、**誰が何を読めるかはここだけが決めている**。
-- 有効化して policy を書かないと誰も何も読めない。逆に書き忘れたテーブルは全員に筒抜け。
--
-- 形は2つだけ。
--   goals            … 自分の行か（auth.uid() = user_id）
--   avatars/records  … 親の goals が自分のものか（EXISTS）
-- FOR ALL なので SELECT / INSERT / UPDATE / DELETE の全部に効く。
-- USING は既にある行、WITH CHECK は書こうとしている行に対する条件。
-- 他人の goal_id を書き込まれないよう、WITH CHECK も同じ条件で置く。

ALTER TABLE goals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_own ON goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY avatars_own ON avatars
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = avatars.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = avatars.goal_id AND g.user_id = auth.uid()));

CREATE POLICY records_own ON records
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM goals g WHERE g.id = records.goal_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM goals g WHERE g.id = records.goal_id AND g.user_id = auth.uid()));
