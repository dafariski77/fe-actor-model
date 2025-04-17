import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics for both implementations
const traditionalErrors = new Counter('traditional_errors');
const actorModelErrors = new Counter('actor_model_errors');

// Response timing metrics
const traditionalTiming = new Trend('traditional_timing');
const actorModelTiming = new Trend('actor_model_timing');

// Request rate metrics
const traditionalRequestRate = new Rate('traditional_req_rate');
const actorModelRequestRate = new Rate('actor_model_req_rate');

// Time to First Byte (TTFB) metrics
const traditionalTTFB = new Trend('traditional_ttfb');
const actorModelTTFB = new Trend('actor_model_ttfb');

// Content size metrics (to estimate memory footprint)
const traditionalContentSize = new Trend('traditional_content_size');
const actorModelContentSize = new Trend('actor_model_content_size');

// Test configuration for different scenarios
export const options = {
  scenarios: {
    // Light load scenario (100 concurrent users)
    // light_load: {
    //   executor: 'ramping-vus',
    //   startVUs: 10,
    //   stages: [
    //     { duration: '30s', target: 100 },
    //     { duration: '1m', target: 100 },
    //     { duration: '30s', target: 0 },
    //   ],
    //   gracefulRampDown: '10s',
    //   tags: { scenario: 'light_load' },
    // },

    // Heavy load scenario (500 concurrent users)
    heavy_load: {
      executor: 'ramping-vus',
      startVUs: 30,
      stages: [
        { duration: '30s', target: 3000 },
        { duration: '1m', target: 3000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
      tags: { scenario: 'heavy_load' },
    },

    // Spike test (sudden surge to 1000 users)
    // spike_test: {
    //   executor: 'ramping-arrival-rate',
    //   startRate: 10,
    //   timeUnit: '1s',
    //   preAllocatedVUs: 1100,
    //   maxVUs: 1500,
    //   stages: [
    //     { duration: '10s', target: 50 },
    //     { duration: '20s', target: 1000 },
    //     { duration: '30s', target: 1000 },
    //     { duration: '10s', target: 0 },
    //   ],
    //   tags: { scenario: 'spike_test' },
    // },
  },
  thresholds: {
    'traditional_timing': ['p(95)<500', 'p(99)<1000'],
    'actor_model_timing': ['p(95)<500', 'p(99)<1000'],
    'traditional_errors': ['count<100'],
    'actor_model_errors': ['count<100'],
    'traditional_ttfb': ['p(95)<200', 'avg<100'],
    'actor_model_ttfb': ['p(95)<200', 'avg<100'],
  },
};

export default function () {
  // Testing the traditional page
  let traditionalStart = new Date();
  let traditionalRes = http.get('http://localhost:3000/simple');
  let traditionalDuration = new Date() - traditionalStart;

  // Add basic timing metrics
  traditionalTiming.add(traditionalDuration);
  traditionalRequestRate.add(1);
  traditionalTTFB.add(traditionalRes.timings.waiting);
  traditionalContentSize.add(traditionalRes.body.length);

  // Check if the request was successful
  let traditionalSuccess = check(traditionalRes, {
    'traditional status is 200': (r) => r.status === 200,
    'traditional page loaded correctly': (r) => r.body.includes('Traditional Page Loaded')
  });

  if (!traditionalSuccess) {
    traditionalErrors.add(1);
    console.log(`Traditional page error: ${traditionalRes.status}, ${traditionalRes.body.substring(0, 200)}...`);
  }

  // Small delay between requests
  sleep(0.2);

  // Testing the actor model page
  let actorStart = new Date();
  let actorRes = http.get('http://localhost:3000/actor-model');
  let actorDuration = new Date() - actorStart;

  // Add basic timing metrics
  actorModelTiming.add(actorDuration);
  actorModelRequestRate.add(1);
  actorModelTTFB.add(actorRes.timings.waiting);
  actorModelContentSize.add(actorRes.body.length);

  // Check if the request was successful
  let actorSuccess = check(actorRes, {
    'actor model status is 200': (r) => r.status === 200,
    'actor model page loaded correctly': (r) => r.body.includes('Actor Model Page Loaded')
  });

  if (!actorSuccess) {
    actorModelErrors.add(1);
    console.log(`Actor model page error: ${actorRes.status}, ${actorRes.body.substring(0, 200)}...`);
  }

  // Add some randomness to the user behavior
  sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}

export function setup() {
  // Make a warmup request to ensure the server is running
  const warmupRes = http.get('http://localhost:3000');
  check(warmupRes, {
    'server is up': (r) => r.status === 200,
  });

  console.log('Starting comprehensive performance test...');
  return { startTime: new Date() };
}
