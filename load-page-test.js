import { sleep } from 'k6';
import { browser } from 'k6/browser';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics for both implementations
const traditionalErrors = new Counter('traditional_errors');
const actorModelErrors = new Counter('actor_model_errors');

// Response timing metrics
const traditionalTiming = new Trend('traditional_timing');
const actorModelTiming = new Trend('actor_model_timing');

// DOM Content Loaded metrics
const traditionalDCL = new Trend('traditional_dom_content_loaded');
const actorModelDCL = new Trend('actor_model_dom_content_loaded');

// First Contentful Paint metrics
const traditionalFCP = new Trend('traditional_first_contentful_paint');
const actorModelFCP = new Trend('actor_model_first_contentful_paint');

// Time to First Byte (TTFB) metrics
const traditionalTTFB = new Trend('traditional_ttfb');
const actorModelTTFB = new Trend('actor_model_ttfb');

// Memory usage estimation (JS heap size)
const traditionalMemory = new Trend('traditional_memory_usage');
const actorModelMemory = new Trend('actor_model_memory_usage');

export const options = {
  scenarios: {
    browser: {
      executor: 'shared-iterations',
      options: {
        browser: {
          type: 'chromium',
        },
      },
      vus: 10,
      iterations: 300,
    },
  },
  thresholds: {
    'traditional_timing': ['p(95)<5000'],
    'actor_model_timing': ['p(95)<5000'],
    'traditional_dom_content_loaded': ['avg<3000'],
    'actor_model_dom_content_loaded': ['avg<3000'],
    'traditional_errors': ['count<10'],
    'actor_model_errors': ['count<10'],
  },
};

export default async function () {
  // Test both implementations
  await testPage('traditional');
  await testPage('actor-model');
}

async function testPage(route) {
  let page;
  let context;

  try {
    context = await browser.newContext();
    page = await context.newPage();
    
    console.log(`Starting ${route} test`);

    // Start measuring navigation timing
    const startTime = new Date().getTime();

    // Navigate to the page
    const response = await page.goto(`http://localhost:3000/${route}`);

    check(response, {
      [`${route} status is 200`]: (r) => r.status() === 200,
    });

    // Wait for network to be quiet
    await page.waitForLoadState("networkidle");

    // Collect performance metrics
    const performanceData = await page.evaluate(() => {
      const navEntry = performance.getEntriesByType('navigation')[0];
      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');

      let memoryInfo = {};
      if (performance.memory) {
        memoryInfo = {
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          usedJSHeapSize: performance.memory.usedJSHeapSize
        };
      }

      return {
        ttfb: navEntry.responseStart - navEntry.requestStart,
        domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.startTime,
        loadComplete: navEntry.loadEventEnd - navEntry.startTime,
        firstContentfulPaint: fcpEntry ? fcpEntry.startTime : null,
        memory: memoryInfo
      };
    });

    // Record metrics based on route
    if (route === 'traditional') {
      traditionalTTFB.add(performanceData.ttfb);
      traditionalDCL.add(performanceData.domContentLoaded);
      if (performanceData.firstContentfulPaint) {
        traditionalFCP.add(performanceData.firstContentfulPaint);
      }
      if (performanceData.memory && performanceData.memory.usedJSHeapSize) {
        traditionalMemory.add(performanceData.memory.usedJSHeapSize);
      }

      // Calculate total response time
      const responseTime = new Date().getTime() - startTime;
      traditionalTiming.add(responseTime);

      // Try to perform a basic interaction
      try {
        await page.waitForSelector('button', { timeout: 2000 });
        await page.click('button');
        await sleep(1);
      } catch (e) {
        console.log('Traditional page: No button found or interaction failed');
      }

    } else if (route === 'actor-model') {
      actorModelTTFB.add(performanceData.ttfb);
      actorModelDCL.add(performanceData.domContentLoaded);
      if (performanceData.firstContentfulPaint) {
        actorModelFCP.add(performanceData.firstContentfulPaint);
      }
      if (performanceData.memory && performanceData.memory.usedJSHeapSize) {
        actorModelMemory.add(performanceData.memory.usedJSHeapSize);
      }

      // Calculate total response time
      const responseTime = new Date().getTime() - startTime;
      actorModelTiming.add(responseTime);

    }

    console.log(`${route} test completed`);

  } catch (error) {
    console.error(`${route} test failed:`, error.message || 'Unknown error');
    if (route === 'traditional') {
      traditionalErrors.add(1);
    } else {
      actorModelErrors.add(1);
    }
    throw error;
  } finally {
    if (page) {
      await page.close().catch(() => { });
    }
    if (context) {
      await context.close().catch(() => { });
    }
  }
}

export function handleSummary(data) {
  // Print comparison report to console
  console.log("\n========== BROWSER PERFORMANCE COMPARISON ==========");
  console.log("Traditional State Management vs. XState Actor Model");
  console.log("===================================================");

  // Function to get metric value or 'N/A' if not available
  function getMetricValue(metric, property) {
    if (!metric || !metric.values || !metric.values[property]) {
      return 'N/A';
    }
    return metric.values[property];
  }

  // Function to determine which approach is better
  function betterApproach(trad, actor, lowerIsBetter = true) {
    if (trad === 'N/A' || actor === 'N/A') return 'N/A';
    if (trad === actor) return 'Equal';
    if (lowerIsBetter) {
      return trad < actor ? 'Traditional' : 'Actor Model';
    }
    return trad > actor ? 'Traditional' : 'Actor Model';
  }

  // Function to calculate percentage difference
  function percentDiff(trad, actor) {
    if (trad === 'N/A' || actor === 'N/A' || trad === 0) return 'N/A';
    return ((Math.abs(trad - actor) / trad) * 100).toFixed(1);
  }

  // Function to format metrics row
  function formatRow(label, tradMetric, actorMetric, property = 'avg', lowerIsBetter = true) {
    const trad = getMetricValue(tradMetric, property);
    const actor = getMetricValue(actorMetric, property);
    const diff = trad !== 'N/A' && actor !== 'N/A' ? Math.abs(trad - actor).toFixed(2) : 'N/A';
    const percent = percentDiff(trad, actor);
    const better = betterApproach(trad, actor, lowerIsBetter);

    return `${label.padEnd(25)} | ${(trad !== 'N/A' ? trad.toFixed(2) : 'N/A').padStart(10)} | ${(actor !== 'N/A' ? actor.toFixed(2) : 'N/A').padStart(10)} | ${diff.padStart(8)} ${percent !== 'N/A' ? `(${percent}%)` : ''} | ${better}`;
  }

  console.log("\n1. PAGE LOAD METRICS (ms):");
  console.log("Metric                   | Traditional | Actor Model | Diff (%)  | Better Approach");
  console.log("-------------------------|------------|------------|-----------|----------------");
  console.log(formatRow("Avg Time to First Byte", data.metrics.traditional_ttfb, data.metrics.actor_model_ttfb));
  console.log(formatRow("Avg DOM Content Loaded", data.metrics.traditional_dom_content_loaded, data.metrics.actor_model_dom_content_loaded));
  console.log(formatRow("Avg First Paint", data.metrics.traditional_first_contentful_paint, data.metrics.actor_model_first_contentful_paint));
  console.log(formatRow("Avg Total Load Time", data.metrics.traditional_timing, data.metrics.actor_model_timing));

  console.log("\n2. PERFORMANCE UNDER LOAD (ms):");
  console.log("Metric                   | Traditional | Actor Model | Diff (%)  | Better Approach");
  console.log("-------------------------|------------|------------|-----------|----------------");
  console.log(formatRow("P90 Load Time", data.metrics.traditional_timing, data.metrics.actor_model_timing, "p(90)"));
  console.log(formatRow("P95 Load Time", data.metrics.traditional_timing, data.metrics.actor_model_timing, "p(95)"));
  console.log(formatRow("Max Load Time", data.metrics.traditional_timing, data.metrics.actor_model_timing, "max"));

  console.log("\n3. MEMORY USAGE (bytes):");
  console.log("Metric                   | Traditional | Actor Model | Diff (%)  | Note");
  console.log("-------------------------|------------|------------|-----------|----------------");
  console.log(formatRow("Avg JS Heap Usage", data.metrics.traditional_memory_usage, data.metrics.actor_model_memory_usage));

  console.log("\n4. RELIABILITY:");
  console.log("Metric                   | Traditional | Actor Model | Better Approach");
  console.log("-------------------------|------------|------------|----------------");

  const tradErrors = data.metrics.traditional_errors ? data.metrics.traditional_errors.values.count : 0;
  const actorErrors = data.metrics.actor_model_errors ? data.metrics.actor_model_errors.values.count : 0;
  console.log(`Error Count              | ${tradErrors.toString().padStart(10)} | ${actorErrors.toString().padStart(10)} | ${tradErrors === actorErrors ? 'Equal' : (tradErrors < actorErrors ? 'Traditional' : 'Actor Model')}`);

  // Overall Performance Analysis
  console.log("\n5. OVERALL PERFORMANCE ANALYSIS:");

  // Count wins
  let tradWins = 0;
  let actorWins = 0;

  // Compare key metrics
  const metrics = [
    { trad: data.metrics.traditional_ttfb, actor: data.metrics.actor_model_ttfb, property: 'avg' },
    { trad: data.metrics.traditional_dom_content_loaded, actor: data.metrics.actor_model_dom_content_loaded, property: 'avg' },
    { trad: data.metrics.traditional_timing, actor: data.metrics.actor_model_timing, property: 'avg' },
    { trad: data.metrics.traditional_timing, actor: data.metrics.actor_model_timing, property: 'p(95)' }
  ];

  metrics.forEach(m => {
    const tradValue = getMetricValue(m.trad, m.property);
    const actorValue = getMetricValue(m.actor, m.property);

    if (tradValue !== 'N/A' && actorValue !== 'N/A') {
      if (tradValue < actorValue) tradWins++;
      else if (actorValue < tradValue) actorWins++;
    }
  });

  // Error comparison
  if (tradErrors < actorErrors) tradWins++;
  else if (actorErrors < tradErrors) actorWins++;

  const winner = tradWins > actorWins ? 'Traditional State Management' :
    (actorWins > tradWins ? 'XState Actor Model' : 'Tie - Both performed similarly');

  console.log(`Overall Performance Winner: ${winner}`);
  console.log(`Traditional wins: ${tradWins}, Actor Model wins: ${actorWins}`);

  console.log("\n6. RECOMMENDATIONS:");
  console.log("- Traditional state management is generally better for: Simple UIs with fewer state transitions");
  console.log("- XState Actor Model is generally better for: Complex UIs with many states and explicit transitions");
  console.log("- Your specific results show that: " + (tradWins > actorWins ?
    "Traditional state management performed better in this test case" :
    actorWins > tradWins ?
      "XState Actor Model performed better in this test case" :
      "Both approaches performed similarly - choose based on code maintainability needs"));

  console.log("\n===================================================");

  return {
    'summary.json': JSON.stringify(data)
  };
}