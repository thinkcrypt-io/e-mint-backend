console.log('=== Testing generateModelSettings Function ===');

// Import the function directly
import { generateModelSettings } from './dist/lib/agent/functions/generateModelSettings.js';

console.log('✅ generateModelSettings function imported successfully');

// Test case 1: Invalid input
console.log('\n📝 Test 1: Invalid input');
const test1 = generateModelSettings();
console.log('Result for empty input:');
console.log(JSON.stringify(test1, null, 2));

// Test case 2: Non-existent model
console.log('\n📝 Test 2: Non-existent model');
const test2 = generateModelSettings('NonExistentModel');
console.log('Result for non-existent model:');
console.log(JSON.stringify(test2, null, 2));

// Test case 3: Testing with 'Blog' as requested
console.log('\n📝 Test 3: Testing with Blog model (as originally requested)');
const blogTest = generateModelSettings('Blog');
console.log('Result for Blog model:');
console.log(JSON.stringify(blogTest, null, 2));

console.log('\n=== Test Complete ===');
