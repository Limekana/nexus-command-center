-- NCC#55 — let manual_assets hold every account type NCC can create.
--
-- ── APPLIED 2026-09-24 ───────────────────────────────────────────────────
-- Applied to production via apply_migration `manual_assets_account_types`,
-- owner-approved, before the client change in the same PR shipped (the
-- one-time re-queue in src/lib/requeueDropped.ts depends on it). Constraint
-- verified validated; security advisors unchanged (PRE-3 only).
--
-- ── WHAT WAS BROKEN ──────────────────────────────────────────────────────
--
-- NCC v1.2.0's account model (src/types/finance.ts `AccountType`) added
-- checking, credit_card, investment and custom. This constraint still allowed
-- only the pre-v1.2 set, so every such account was refused with 23514, and
-- every transaction booked to it then failed transactions_account_id_fkey.
-- The push queue treats both as permanent and dropped them: on 2026-09-24 the
-- server held 0 checking, credit_card or investment rows.
--
-- ── ADDITIVE, PER `P1` ───────────────────────────────────────────────────
--
-- The new set is a strict superset of the old one, so every stored row still
-- passes and every shipped client that writes an old value keeps working.
-- `credit` stays for pre-v1.2 clients; current clients read it back as
-- credit_card (legacyAssetTypeToAccountType). Every NCC since v1.2 already
-- maps the four new values on pull. RLS, triggers and the realtime
-- publication are untouched.

alter table public.manual_assets
  drop constraint manual_assets_asset_type_check;

alter table public.manual_assets
  add constraint manual_assets_asset_type_check check (asset_type = any (array[
    -- pre-v1.2 set, unchanged
    'cash', 'savings', 'property', 'vehicle', 'other', 'loan', 'credit',
    -- v1.2 account model
    'checking', 'credit_card', 'investment', 'custom'
  ]::text[]));
