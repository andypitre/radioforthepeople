-- Row Level Security: policies reference app.current_user_id, a
-- custom GUC set via `SET LOCAL app.current_user_id = '<uuid>'` at
-- the start of each authenticated request. `current_setting(..., true)`
-- returns NULL if unset so unauthenticated reads don't error.

-- Enums require explicit USAGE for non-superuser roles
GRANT USAGE ON TYPE "public"."show_member_role" TO rftp_app;
--> statement-breakpoint

-- users ------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Everyone can read user basic info (display name shows up on cohost lists, etc)
CREATE POLICY "users_select" ON "users" FOR SELECT USING (true);
--> statement-breakpoint

-- OAuth callback is the only code path that inserts users; trust the server
CREATE POLICY "users_insert" ON "users" FOR INSERT WITH CHECK (true);
--> statement-breakpoint

-- Users can only update their own row
CREATE POLICY "users_update" ON "users" FOR UPDATE USING (
  id = current_setting('app.current_user_id', true)::uuid
);
--> statement-breakpoint

-- shows ------------------------------------------------------------
ALTER TABLE "shows" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "shows_select" ON "shows" FOR SELECT USING (true);
--> statement-breakpoint

CREATE POLICY "shows_insert" ON "shows" FOR INSERT WITH CHECK (
  created_by = current_setting('app.current_user_id', true)::uuid
);
--> statement-breakpoint

-- Only owners (via show_members) can update or delete a show
CREATE POLICY "shows_update" ON "shows" FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM show_members sm
    WHERE sm.show_id = shows.id
      AND sm.user_id = current_setting('app.current_user_id', true)::uuid
      AND sm.role = 'owner'
  )
);
--> statement-breakpoint

CREATE POLICY "shows_delete" ON "shows" FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM show_members sm
    WHERE sm.show_id = shows.id
      AND sm.user_id = current_setting('app.current_user_id', true)::uuid
      AND sm.role = 'owner'
  )
);
--> statement-breakpoint

-- show_members -----------------------------------------------------
ALTER TABLE "show_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Public SELECT so we can show cohost names on public show pages.
-- Tighten later if we decide cohost lists should be private.
CREATE POLICY "show_members_select" ON "show_members" FOR SELECT USING (true);
--> statement-breakpoint

-- Allow INSERT when either:
--   (a) the row is the creator claiming themselves as owner of a show
--       they just created (bootstraps the first owner row), OR
--   (b) the current user is already an owner of the show (adding cohosts)
CREATE POLICY "show_members_insert" ON "show_members" FOR INSERT WITH CHECK (
  (
    user_id = current_setting('app.current_user_id', true)::uuid
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = show_members.show_id
        AND s.created_by = current_setting('app.current_user_id', true)::uuid
    )
  )
  OR EXISTS (
    SELECT 1 FROM show_members sm
    WHERE sm.show_id = show_members.show_id
      AND sm.user_id = current_setting('app.current_user_id', true)::uuid
      AND sm.role = 'owner'
  )
);
--> statement-breakpoint

CREATE POLICY "show_members_update" ON "show_members" FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM show_members sm
    WHERE sm.show_id = show_members.show_id
      AND sm.user_id = current_setting('app.current_user_id', true)::uuid
      AND sm.role = 'owner'
  )
);
--> statement-breakpoint

CREATE POLICY "show_members_delete" ON "show_members" FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM show_members sm
    WHERE sm.show_id = show_members.show_id
      AND sm.user_id = current_setting('app.current_user_id', true)::uuid
      AND sm.role = 'owner'
  )
);
