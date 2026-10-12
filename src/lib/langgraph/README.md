# LangGraph Integration for ProNax

Multi-agent workflow orchestration system built with LangGraph for the ProNax video platform.

## Overview

This integration provides a stateful, multi-agent system for handling various platform tasks including:
- Video upload processing
- Content moderation
- Copyright detection
- Content recommendations
- Revenue analysis
- User support
- Content discovery

## Installation

The LangGraph package is already installed in your project:

```bash
npm install @langchain/langgraph
```

## Project Structure

```
src/lib/langgraph/
├── index.ts       # Main entry point
├── types.ts       # State schema and agent types
├── graph.ts       # Agent graph implementation
├── test.ts        # Integration tests
└── README.md      # This file
```

## Quick Start

### Basic Usage

```typescript
import { executeWorkflow, TaskType } from './lib/langgraph';

// Execute a video upload workflow
const result = await executeWorkflow(TaskType.VIDEO_UPLOAD, {
  videoId: 'video-123',
  videoTitle: 'My Video',
  videoCategory: 'gaming',
  userId: 'user-123',
});

console.log('Workflow result:', result);
```

### Available Task Types

- `TaskType.VIDEO_UPLOAD` - Processes uploaded videos through analysis, moderation, and copyright checks
- `TaskType.CONTENT_MODERATION` - Reviews content for policy violations
- `TaskType.COPYRIGHT_CHECK` - Detects potential copyright violations
- `TaskType.RECOMMENDATION` - Generates personalized content recommendations
- `TaskType.REVENUE_ANALYSIS` - Analyzes creator revenue and monetization data
- `TaskType.USER_SUPPORT` - Provides user support and assistance
- `TaskType.CONTENT_DISCOVERY` - Helps users discover relevant content
- `TaskType.GENERAL` - General purpose task handling

### Agent Types

The system includes the following specialized agents:

1. **Orchestrator** - Coordinates and routes tasks between specialized agents
2. **Content Analyzer** - Analyzes video content for metadata, tags, and categorization
3. **Moderator** - Reviews content for policy violations and community guidelines
4. **Copyright Detector** - Detects potential copyright violations using fingerprinting
5. **Recommendation Engine** - Generates personalized content recommendations
6. **Revenue Tracker** - Tracks and analyzes creator revenue and monetization
7. **Support Agent** - Provides user support and answers common questions
8. **Analytics Agent** - Analyzes platform metrics and generates insights

## State Schema

The agent state includes:

- `currentAgent` - Currently active agent
- `messages` - Conversation/message history
- `taskId` - Unique task identifier
- `taskType` - Type of task being processed
- `videoId`, `videoTitle`, `videoCategory` - Video-specific fields
- `userId`, `userRole` - User context
- `moderationRequired`, `moderationStatus` - Moderation flags
- `copyrightCheckRequired`, `copyrightStatus` - Copyright detection flags
- `contentAnalysis` - Content analysis results
- `revenueData` - Revenue and monetization data
- `recommendations` - Generated recommendations
- `agentOutputs` - Agent-specific outputs
- `errors` - Error tracking
- `status` - Workflow status (idle, running, completed, failed, paused)
- `lastUpdated` - Timestamp of last update

## Running Tests

### Run all tests:

```bash
npx tsx src/lib/langgraph/test.ts
```

### Run the basic integration test:

```bash
node test-langgraph.mjs
```

## Example Workflows

### Video Upload Workflow

```typescript
const result = await executeWorkflow(TaskType.VIDEO_UPLOAD, {
  videoId: 'video-123',
  videoTitle: 'My Gaming Video',
  videoCategory: 'gaming',
  userId: 'user-123',
  userRole: 'creator',
});

// The workflow will:
// 1. Analyze content
// 2. Moderate content
// 3. Check for copyright violations
// 4. Return final state with all results
```

### Recommendation Workflow

```typescript
const result = await executeWorkflow(TaskType.RECOMMENDATION, {
  userId: 'user-123',
  userRole: 'user',
});

// Returns personalized recommendations
console.log(result.recommendations);
```

### Revenue Analysis Workflow

```typescript
const result = await executeWorkflow(TaskType.REVENUE_ANALYSIS, {
  videoId: 'video-123',
  userId: 'user-123',
  userRole: 'creator',
});

// Returns revenue data and analytics insights
console.log(result.revenueData);
console.log(result.contentAnalysis);
```

## Customization

### Adding New Agents

1. Define the agent type in `types.ts`:

```typescript
export enum AgentType {
  // ... existing agents
  CUSTOM_AGENT = 'custom_agent',
}
```

2. Create the agent node function in `graph.ts`:

```typescript
const customAgentNode: AgentNodeFunction = async (state: AgentStateType) => {
  // Your agent logic here
  return {
    // Updated state
  };
};
```

3. Add the node to the graph:

```typescript
graph.addNode(AgentType.CUSTOM_AGENT, customAgentNode);
```

4. Add routing logic in `routeToNextAgent` function

### Modifying Workflows

Edit the `WORKFLOW_CONFIGS` object in `types.ts` to customize agent sequences and priorities for each task type.

## Next Steps

1. Replace placeholder logic in agent nodes with actual implementations
2. Integrate with your existing APIs (Supabase, R2 storage, etc.)
3. Add checkpointing for persistent state management
4. Implement error handling and retry logic
5. Add monitoring and logging
6. Configure timeouts and rate limits for each agent

## Resources

- [LangGraph Documentation](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraph.js GitHub](https://github.com/langchain-ai/langgraphjs)
- [ProNax Project](../README.md)
