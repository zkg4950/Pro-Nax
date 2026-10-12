-- Agent Checkpoints Table
-- Stores state checkpoints for LangGraph agent workflows

CREATE TABLE IF NOT EXISTS public.agent_checkpoints (
  id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.agent_checkpoints ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can manage checkpoints
CREATE POLICY "Service role full access"
  ON public.agent_checkpoints
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: Authenticated users can read their own checkpoints
CREATE POLICY "Users read own checkpoints"
  ON public.agent_checkpoints
  FOR SELECT
  TO authenticated
  USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_updated_at
  ON public.agent_checkpoints(updated_at DESC);

-- Add comment
COMMENT ON TABLE public.agent_checkpoints IS 'Stores state checkpoints for LangGraph agent workflows for persistence and resumption';
