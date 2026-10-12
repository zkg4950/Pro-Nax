/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
export interface StudioProfile {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}
