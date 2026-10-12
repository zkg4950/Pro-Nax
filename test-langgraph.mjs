/**
 * Simple test script to verify LangGraph integration
 * Run with: node test-langgraph.mjs
 */

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

console.log('🧪 Testing LangGraph Integration...\n');

try {
  // Test 1: Check if StateGraph is available
  console.log('1. Checking StateGraph availability...');
  if (StateGraph) {
    console.log('✓ StateGraph is available');
  } else {
    console.log('✗ StateGraph is not available');
  }

  // Test 2: Check if START and END are available
  console.log('\n2. Checking START and END constants...');
  if (START && END) {
    console.log('✓ START and END are available');
  } else {
    console.log('✗ START and END are not available');
  }

  // Test 3: Check if Annotation is available
  console.log('\n3. Checking Annotation availability...');
  if (Annotation) {
    console.log('✓ Annotation is available');
  } else {
    console.log('✗ Annotation is not available');
  }

  // Test 4: Create a simple state graph
  console.log('\n4. Creating a simple state graph...');
  const SimpleState = Annotation.Root({
    count: Annotation({
      reducer: (prev, next) => next,
      default: () => 0,
    }),
  });

  const graph = new StateGraph({ state: SimpleState });
  console.log('✓ StateGraph instance created successfully');

  console.log('\n✅ LangGraph integration test completed successfully!');
  console.log('\nNext steps:');
  console.log('  1. Run TypeScript tests: npx tsx src/lib/langgraph/test.ts');
  console.log('  2. Or integrate into your application using: import { executeWorkflow, TaskType } from "./lib/langgraph"');
} catch (error) {
  console.error('\n❌ LangGraph integration test failed:', error.message);
  console.error('\nMake sure you have installed the package:');
  console.error('  npm install @langchain/langgraph');
  process.exit(1);
}
