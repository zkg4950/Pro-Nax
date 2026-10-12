/**
 * Checkpoint / State Persistence for LangGraph
 * Simple in-memory and Supabase-based checkpoint savers
 */

import { AgentStateType } from '../lib/langgraph/types';
import dotenv from 'dotenv';

// Load environment variables for Node.js context
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Get environment variable safely
 */
function getEnvVar(key: string): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || '';
  }
  return process.env[key] || '';
}

/**
 * In-memory checkpoint saver (for development)
 */
class MemoryCheckpointSaver {
  private checkpoints: Map<string, AgentStateType> = new Map();

  save(checkpointId: string, state: AgentStateType): void {
    this.checkpoints.set(checkpointId, {
      ...state,
      lastUpdated: new Date(),
    });
    console.log(`[Checkpoint] Saved state for ${checkpointId}`);
  }

  load(checkpointId: string): AgentStateType | null {
    const state = this.checkpoints.get(checkpointId);
    if (state) {
      console.log(`[Checkpoint] Loaded state for ${checkpointId}`);
    }
    return state || null;
  }

  delete(checkpointId: string): void {
    this.checkpoints.delete(checkpointId);
    console.log(`[Checkpoint] Deleted state for ${checkpointId}`);
  }

  list(): string[] {
    return Array.from(this.checkpoints.keys());
  }

  clear(): void {
    this.checkpoints.clear();
    console.log('[Checkpoint] Cleared all checkpoints');
  }
}

/**
 * Supabase-based checkpoint saver (for production)
 */
class SupabaseCheckpointSaver {
  private tableName = 'agent_checkpoints';

  async save(checkpointId: string, state: AgentStateType): Promise<void> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
      const supabaseKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from(this.tableName)
        .upsert({
          id: checkpointId,
          state: JSON.stringify(state),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('[Checkpoint] Supabase save error:', error);
        throw error;
      }

      console.log(`[Checkpoint] Saved state to Supabase for ${checkpointId}`);
    } catch (error) {
      console.error('[Checkpoint] Failed to save to Supabase:', error);
      // Fallback to memory
      memoryCheckpointSaver.save(checkpointId, state);
    }
  }

  async load(checkpointId: string): Promise<AgentStateType | null> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
      const supabaseKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from(this.tableName)
        .select('state')
        .eq('id', checkpointId)
        .single();

      if (error) {
        console.error('[Checkpoint] Supabase load error:', error);
        throw error;
      }

      if (data && data.state) {
        const state = JSON.parse(data.state);
        console.log(`[Checkpoint] Loaded state from Supabase for ${checkpointId}`);
        return state;
      }

      return null;
    } catch (error) {
      console.error('[Checkpoint] Failed to load from Supabase:', error);
      // Fallback to memory
      return memoryCheckpointSaver.load(checkpointId);
    }
  }

  async delete(checkpointId: string): Promise<void> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
      const supabaseKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', checkpointId);

      if (error) {
        console.error('[Checkpoint] Supabase delete error:', error);
        throw error;
      }

      console.log(`[Checkpoint] Deleted state from Supabase for ${checkpointId}`);
    } catch (error) {
      console.error('[Checkpoint] Failed to delete from Supabase:', error);
      // Fallback to memory
      memoryCheckpointSaver.delete(checkpointId);
    }
  }

  async list(): Promise<string[]> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
      const supabaseKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from(this.tableName)
        .select('id');

      if (error) {
        console.error('[Checkpoint] Supabase list error:', error);
        throw error;
      }

      return data?.map((item: any) => item.id) || [];
    } catch (error) {
      console.error('[Checkpoint] Failed to list from Supabase:', error);
      // Fallback to memory
      return memoryCheckpointSaver.list();
    }
  }

  async clear(): Promise<void> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
      const supabaseKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');

      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.error('[Checkpoint] Supabase clear error:', error);
        throw error;
      }

      console.log('[Checkpoint] Cleared all checkpoints from Supabase');
    } catch (error) {
      console.error('[Checkpoint] Failed to clear from Supabase:', error);
      // Fallback to memory
      memoryCheckpointSaver.clear();
    }
  }
}

/**
 * Initialize the checkpoint table in Supabase
 */
async function initializeCheckpointTable() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getEnvVar('VITE_SUPABASE_URL'),
      getEnvVar('VITE_SUPABASE_SERVICE_ROLE_KEY')
    );

    // Create table if it doesn't exist
    const { error } = await supabase.rpc('create_agent_checkpoints_table', {
      if_not_exists: true,
    });

    if (error && error.code !== 'PGRST116') {
      console.error('[Checkpoint] Table initialization error:', error);
    }
  } catch (error) {
    console.error('[Checkpoint] Failed to initialize table:', error);
  }
}

// Export instances
export const memoryCheckpointSaver = new MemoryCheckpointSaver();
export const supabaseCheckpointSaver = new SupabaseCheckpointSaver();

// Choose checkpoint saver based on environment
export const checkpointSaver =
  (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'production') ||
  process.env.NODE_ENV === 'production'
    ? supabaseCheckpointSaver
    : memoryCheckpointSaver;

/**
 * Wrapper to automatically save checkpoints
 */
export async function withCheckpoint<T>(
  checkpointId: string,
  fn: () => Promise<T>
): Promise<T> {
  // Load previous state if exists
  const previousState = await checkpointSaver.load(checkpointId);

  // Execute function
  const result = await fn();

  // Save new state
  if (result && typeof result === 'object' && 'taskId' in result) {
    await checkpointSaver.save(checkpointId, result as AgentStateType);
  }

  return result;
}
