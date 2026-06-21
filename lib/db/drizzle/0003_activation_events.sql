-- Activation events: tracks the moment a user reaches the product's "aha".
-- Used to compute the activation metric (Sean Ellis must-have) and for the README/GT essay
-- with real numbers ("X% of users who completed first sync within 5 minutes returned within 7 days").

CREATE TABLE "activation_events" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "activation_events_user_idx" ON "activation_events" ("user_id");