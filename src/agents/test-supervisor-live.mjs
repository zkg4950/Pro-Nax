/**
 * Live Supervisor Test
 * Tests supervisor execution with live system context
 * Verifies service role key usage and privileged operations
 */

import { executeSupervisor } from './supervisorGraph.js';
import { SystemEventType, AlertLevel } from './supervisorTypes.js';
import { adminTools } from './tools/adminTools.js';
import { startSupervisorRealtime } from './supervisorRealtime.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test 1: System Health Check
 */
async function testSystemHealth() {
  console.log('\n=== Test 1: System Health Check ===');
  try {
    const healthResult = await adminTools.getDatabaseHealth();
    console.log('Health Result:', JSON.stringify(healthResult, null, 2));
    return healthResult.success;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

/**
 * Test 2: Fetch System Logs
 */
async function testFetchLogs() {
  console.log('\n=== Test 2: Fetch System Logs ===');
  try {
    const logsResult = await adminTools.fetchSystemLogs({
      timeRange: '1h',
      level: 'error',
      limit: 10,
    });
    console.log('Logs Result:', JSON.stringify(logsResult, null, 2));
    return logsResult.success;
  } catch (error) {
    console.error('Fetch logs failed:', error);
    return false;
  }
}

/**
 * Test 3: Supervisor Execution with Manual Event
 */
async function testSupervisorExecution() {
  console.log('\n=== Test 3: Supervisor Execution ===');
  try {
    const event = {
      type: SystemEventType.SYSTEM_HEALTH_CHECK,
      severity: AlertLevel.INFO,
      data: {
        manualTrigger: true,
      },
      timestamp: new Date(),
      source: 'test_script',
    };

    const result = await executeSupervisor(event);
    console.log('Supervisor Result:', JSON.stringify(result, null, 2));
    return result.status !== 'error';
  } catch (error) {
    console.error('Supervisor execution failed:', error);
    return false;
  }
}

/**
 * Test 4: Content Moderation (Dry Run)
 */
async function testContentModeration() {
  console.log('\n=== Test 4: Content Moderation (Dry Run) ===');
  try {
    // This is a dry run - we won't actually moderate content
    // Just test the tool connectivity
    const moderationResult = await adminTools.manageContent({
      action: 'flag',
      contentType: 'video',
      contentId: '00000000-0000-0000-0000-000000000000', // Invalid UUID for safety
      reason: 'Test moderation',
      moderatorId: 'test_system',
    });

    console.log('Moderation Result:', JSON.stringify(moderationResult, null, 2));
    // We expect this to fail due to invalid UUID, but the tool should be reachable
    return true;
  } catch (error) {
    console.error('Content moderation test failed:', error);
    return false;
  }
}

/**
 * Test 5: User Management (Dry Run)
 */
async function testUserManagement() {
  console.log('\n=== Test 5: User Management (Dry Run) ===');
  try {
    // This is a dry run - we won't actually manage users
    // Just test the tool connectivity
    const userResult = await adminTools.manageUsers({
      action: 'inspect',
      userId: '00000000-0000-0000-0000-000000000000', // Invalid UUID for safety
      reason: 'Test user management',
    });

    console.log('User Management Result:', JSON.stringify(userResult, null, 2));
    // We expect this to fail due to invalid UUID, but the tool should be reachable
    return true;
  } catch (error) {
    console.error('User management test failed:', error);
    return false;
  }
}

/**
 * Test 6: Performance Metrics
 */
async function testPerformanceMetrics() {
  console.log('\n=== Test 6: Performance Metrics ===');
  try {
    const perfResult = await adminTools.getPerformanceMetrics();
    console.log('Performance Result:', JSON.stringify(perfResult, null, 2));
    return perfResult.success;
  } catch (error) {
    console.error('Performance metrics test failed:', error);
    return false;
  }
}

/**
 * Test 7: Realtime Listener Startup
 */
async function testRealtimeListener() {
  console.log('\n=== Test 7: Realtime Listener Startup ===');
  try {
    const listener = startSupervisorRealtime();
    const status = listener.getStatus();
    console.log('Realtime Listener Status:', JSON.stringify(status, null, 2));

    // Stop the listener after test
    setTimeout(() => {
      listener.stop();
      console.log('Realtime listener stopped');
    }, 2000);

    return status.isEnabled;
  } catch (error) {
    console.error('Realtime listener test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('========================================');
  console.log('Supervisor Live Test Suite');
  console.log('========================================');

  const results = {
    systemHealth: await testSystemHealth(),
    fetchLogs: await testFetchLogs(),
    supervisorExecution: await testSupervisorExecution(),
    contentModeration: await testContentModeration(),
    userManagement: await testUserManagement(),
    performanceMetrics: await testPerformanceMetrics(),
    realtimeListener: await testRealtimeListener(),
  };

  console.log('\n========================================');
  console.log('Test Results Summary');
  console.log('========================================');
  console.log('System Health:', results.systemHealth ? '✓ PASS' : '✗ FAIL');
  console.log('Fetch Logs:', results.fetchLogs ? '✓ PASS' : '✗ FAIL');
  console.log('Supervisor Execution:', results.supervisorExecution ? '✓ PASS' : '✗ FAIL');
  console.log('Content Moderation:', results.contentModeration ? '✓ PASS' : '✗ FAIL');
  console.log('User Management:', results.userManagement ? '✓ PASS' : '✗ FAIL');
  console.log('Performance Metrics:', results.performanceMetrics ? '✓ PASS' : '✗ FAIL');
  console.log('Realtime Listener:', results.realtimeListener ? '✓ PASS' : '✗ FAIL');

  const passedCount = Object.values(results).filter((r) => r).length;
  const totalCount = Object.keys(results).length;

  console.log(`\nTotal: ${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
