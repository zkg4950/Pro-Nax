/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
/**
 * Canonical ad placement registry.
 *
 * Every slot listed here is actually rendered somewhere in the app, so the
 * admin console can only ever show placements that really exist — and the
 * app can only ever read placements an admin can configure.
 */
export interface AdSlotDefinition {
  slot: string;
  kind: 'banner' | 'video';
  /** Where the placement renders in the product. */
  surface: string;
  help: string;
}

export const AD_SLOT_REGISTRY: AdSlotDefinition[] = [
  {
    slot: 'home_feed',
    kind: 'banner',
    surface: 'Home feed',
    help: 'Native/banner ad injected between video cards on the home feed.',
  },
  {
    slot: 'feed_grid_row',
    kind: 'banner',
    surface: 'Video grids',
    help: 'Banner injected between rows of any video grid (trending, explore, channel).',
  },
  {
    slot: 'watch_below_player',
    kind: 'banner',
    surface: 'Watch page',
    help: 'High-CTR banner shown directly under the main video player.',
  },
  {
    slot: 'watch_sidebar',
    kind: 'banner',
    surface: 'Watch page',
    help: 'Sticky display ad in the watch page sidebar (desktop + mobile rail).',
  },
  {
    slot: 'in_stream',
    kind: 'banner',
    surface: 'Watch page',
    help: 'Overlay/companion unit rendered on top of the player stage.',
  },
  {
    slot: 'player_preroll',
    kind: 'video',
    surface: 'Video player',
    help: 'VAST/VPAID video ad played before playback starts (skippable after 5s).',
  },
  {
    slot: 'shorts_between',
    kind: 'video',
    surface: 'Shorts',
    help: 'Full-screen vertical VAST interstitial shown every N swipes in Shorts.',
  },
];

export const AD_SLOT_HELP: Record<string, string> = Object.fromEntries(
  AD_SLOT_REGISTRY.map((s) => [s.slot, s.help]),
);

/** Blank row used when seeding a missing placement into `ad_settings`. */
export function blankSlotRow(def: AdSlotDefinition) {
  return {
    slot: def.slot,
    kind: def.kind,
    network: 'custom',
    enabled: false,
    html_snippet: null,
    vast_tag_url: null,
    ad_unit_id: null,
    publisher_id: null,
    frequency: def.kind === 'video' ? 1 : 4,
    notes: def.help,
  };
}
