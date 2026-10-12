/**
 * LangGraph Integration Test
 * Verifies that the agent graph is properly configured and functional
 */

import { executeWorkflow } from './graph';
import { TaskType } from './types';

/**
 * Test video upload workflow
 */
async function testVideoUploadWorkflow() {
  console.log('\n=== Testing Video Upload Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.VIDEO_UPLOAD, {
      videoId: 'test-video-123',
      videoTitle: 'Test Video',
      videoCategory: 'gaming',
      userId: 'test-user-123',
      userRole: 'creator',
    });

    console.log('✓ Video upload workflow completed successfully');
    console.log('Final state:', JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error('✗ Video upload workflow failed:', error);
    return false;
  }
}

/**
 * Test recommendation workflow
 */
async function testRecommendationWorkflow() {
  console.log('\n=== Testing Recommendation Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.RECOMMENDATION, {
      userId: 'test-user-123',
      userRole: 'user',
    });

    console.log('✓ Recommendation workflow completed successfully');
    console.log('Recommendations:', result.recommendations);
    return true;
  } catch (error) {
    console.error('✗ Recommendation workflow failed:', error);
    return false;
  }
}

/**
 * Test revenue analysis workflow
 */
async function testRevenueAnalysisWorkflow() {
  console.log('\n=== Testing Revenue Analysis Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.REVENUE_ANALYSIS, {
      videoId: 'test-video-123',
      userId: 'test-user-123',
      userRole: 'creator',
    });

    console.log('✓ Revenue analysis workflow completed successfully');
    console.log('Revenue data:', result.revenueData);
    return true;
  } catch (error) {
    console.error('✗ Revenue analysis workflow failed:', error);
    return false;
  }
}

/**
 * Test content moderation workflow
 */
async function testContentModerationWorkflow() {
  console.log('\n=== Testing Content Moderation Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.CONTENT_MODERATION, {
      videoId: 'test-video-123',
      userId: 'test-user-123',
      userRole: 'moderator',
    });

    console.log('✓ Content moderation workflow completed successfully');
    console.log('Moderation status:', result.moderationStatus);
    return true;
  } catch (error) {
    console.error('✗ Content moderation workflow failed:', error);
    return false;
  }
}

/**
 * Test copyright check workflow
 */
async function testCopyrightCheckWorkflow() {
  console.log('\n=== Testing Copyright Check Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.COPYRIGHT_CHECK, {
      videoId: 'test-video-123',
      userId: 'test-user-123',
      userRole: 'creator',
    });

    console.log('✓ Copyright check workflow completed successfully');
    console.log('Copyright status:', result.copyrightStatus);
    return true;
  } catch (error) {
    console.error('✗ Copyright check workflow failed:', error);
    return false;
  }
}

/**
 * Test user support workflow
 */
async function testUserSupportWorkflow() {
  console.log('\n=== Testing User Support Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.USER_SUPPORT, {
      userId: 'test-user-123',
      userRole: 'user',
      taskDescription: 'Help with video upload',
    });

    console.log('✓ User support workflow completed successfully');
    console.log('Support response:', result.agentOutputs?.support_agent);
    return true;
  } catch (error) {
    console.error('✗ User support workflow failed:', error);
    return false;
  }
}

/**
 * Test content discovery workflow
 */
async function testContentDiscoveryWorkflow() {
  console.log('\n=== Testing Content Discovery Workflow ===\n');

  try {
    const result = await executeWorkflow(TaskType.CONTENT_DISCOVERY, {
      userId: 'test-user-123',
      userRole: 'user',
    });

    console.log('✓ Content discovery workflow completed successfully');
    console.log('Recommendations:', result.recommendations);
    return true;
  } catch (error) {
    console.error('✗ Content discovery workflow failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Starting LangGraph Integration Tests\n');

  const tests = [
    { name: 'Video Upload', fn: testVideoUploadWorkflow },
    { name: 'Recommendation', fn: testRecommendationWorkflow },
    { name: 'Revenue Analysis', fn: testRevenueAnalysisWorkflow },
    { name: 'Content Moderation', fn: testContentModerationWorkflow },
    { name: 'Copyright Check', fn: testCopyrightCheckWorkflow },
    { name: 'User Support', fn: testUserSupportWorkflow },
    { name: 'Content Discovery', fn: testContentDiscoveryWorkflow },
  ];

  const results = [];

  for (const test of tests) {
    const passed = await test.fn();
    results.push({ name: test.name, passed });
  }

  console.log('\n=== Test Results ===\n');
  results.forEach((result) => {
    console.log(`${result.passed ? '✓' : '✗'} ${result.name}`);
  });

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log(`\n${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('\n🎉 All tests passed! LangGraph integration is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the errors above.');
  }

  return passedCount === totalCount;
}

/**
 * Run a specific test
 */
async function runSpecificTest(testName: string) {
  console.log(`🧪 Running specific test: ${testName}\n`);

  switch (testName.toLowerCase()) {
    case 'video-upload':
      return await testVideoUploadWorkflow();
    case 'recommendation':
      return await testRecommendationWorkflow();
    case 'revenue-analysis':
      return await testRevenueAnalysisWorkflow();
    case 'content-moderation':
      return await testContentModerationWorkflow();
    case 'copyright-check':
      return await testCopyrightCheckWorkflow();
    case 'user-support':
      return await testUserSupportWorkflow();
    case 'content-discovery':
      return await testContentDiscoveryWorkflow();
    default:
      console.error(`Unknown test: ${testName}`);
      return false;
  }
}

// Export test functions
export {
  testVideoUploadWorkflow,
  testRecommendationWorkflow,
  testRevenueAnalysisWorkflow,
  testContentModerationWorkflow,
  testCopyrightCheckWorkflow,
  testUserSupportWorkflow,
  testContentDiscoveryWorkflow,
  runAllTests,
  runSpecificTest,
};

// Always run all tests when executed
runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
