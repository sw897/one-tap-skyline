import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';

export const cities = sqliteTable('cities', {
  id: text('id').primaryKey(), epoch: text('epoch').notNull(), displayName: text('display_name').notNull(),
  rulesetId: text('ruleset_id').notNull(), isTest: integer('is_test').notNull().default(0),
  revision: integer('revision').notNull().default(0), nextPlot: integer('next_plot').notNull().default(0), capacity: integer('capacity').notNull().default(60),
}, t => [check('city_capacity', sql`${t.nextPlot} >= 0 AND ${t.nextPlot} <= ${t.capacity}`)]);
export const players = sqliteTable('players', {
  id: text('id').primaryKey(), publicId: text('public_id').notNull().unique(),
  credentialHash: text('credential_hash').notNull().unique(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(), cityId: text('city_id').notNull().references(() => cities.id), playerId: text('player_id').notNull().references(() => players.id),
  startKey: text('start_key').notNull(), rulesetId: text('ruleset_id').notNull(), rulesJson: text('rules_json').notNull(), geometryVersion: text('geometry_version').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(), status: text('status').notNull().default('active'),
  requestHash: text('request_hash'), traceJson: text('trace_json'), towerJson: text('tower_json'), floors: integer('floors'),
  finalizeToken: text('finalize_token'), resultKind: text('result_kind'), previousJson: text('previous_json'), receiptJson: text('receipt_json'),
}, t => [
  uniqueIndex('run_start_key').on(t.cityId,t.playerId,t.startKey),
  uniqueIndex('one_active_run').on(t.cityId,t.playerId).where(sql`${t.status} = 'active'`),
  index('run_history').on(t.cityId,t.playerId,t.createdAt),
]);
export const buildings = sqliteTable('buildings', {
  id: text('id').primaryKey(), cityId: text('city_id').notNull().references(() => cities.id), playerId: text('player_id').notNull().references(() => players.id),
  plotId: integer('plot_id').notNull(), color: text('color').notNull(), name: text('name').notNull(),
  bestRunId: text('best_run_id').notNull().references(() => runs.id), floors: integer('floors').notNull(), towerJson: text('tower_json').notNull(), achievedAt: integer('achieved_at').notNull(),
}, t => [uniqueIndex('one_player_building').on(t.cityId,t.playerId),uniqueIndex('one_city_plot').on(t.cityId,t.plotId),index('city_ranking').on(t.cityId,t.floors)]);
export const rateLimits = sqliteTable('rate_limits', {
  bucket: text('bucket').primaryKey(), count: integer('count').notNull().default(0), expiresAt: integer('expires_at').notNull(),
});

export const photoAssets = sqliteTable('photo_assets', {
  id: text('id').primaryKey(), cityId: text('city_id').notNull().references(() => cities.id),
  playerId: text('player_id').notNull().references(() => players.id),
  uploadKey: text('upload_key').notNull(), requestHash: text('request_hash').notNull(),
  status: text('status').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
  imageKey: text('image_key').notNull(), thumbnailKey: text('thumbnail_key').notNull(),
  bytes: integer('bytes').notNull().default(0), width: integer('width').notNull().default(512), height: integer('height').notNull().default(768),
}, t => [uniqueIndex('photo_upload_retry').on(t.cityId,t.playerId,t.uploadKey), index('photo_expiry').on(t.expiresAt)]);

export const buildingFacades = sqliteTable('building_facades', {
  buildingId: text('building_id').primaryKey().references(() => buildings.id),
  assetId: text('asset_id').references(() => photoAssets.id), version: integer('version').notNull().default(0),
});

// Infrastructure marker, not retained player/game content. Prevents repeat resets.
export const gameClock = sqliteTable('game_clock', {
  id: text('id').primaryKey(), dayStart: integer('day_start').notNull(), resetToken: text('reset_token'),
});
