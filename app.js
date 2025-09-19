// Simple helper to normalise category names
function canonCategory(c) {
  if (!c) return '';
  const s = String(c).trim().toLowerCase();
  // merge vape and disposable under Vapor Pens
  if (s.includes('vape') || s.includes('disposable')) return 'Vapor Pens';
  if (s.startsWith('pre')) return 'Pre-Rolls';
  if (s.includes('flower')) return 'Flower';
  if (s.includes('edible')) return 'Edibles';
  if (s.includes('beverage')) return 'Beverages';
  if (s.includes('concentrate')) return 'Concentrates';
  if (s.includes('tincture')) return 'Tinctures';
  if (s.includes('topical')) return 'Topicals';
  if (s.startsWith('cbd')) return 'CBD';
  // accessories and other categories remain as given
  // capitalise first letter for display
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Convert an array of Category->value pairs into an aggregated object keyed by canonical category
function aggregateMap(map) {
  const out = {};
  if (!map) return out;
  Object.entries(map).forEach(([k, v]) => {
    const key = canonCategory(k);
    const val = Number(v) || 0;
    out[key] = (out[key] || 0) + val;
  });
  return out;
}

// Parse CSV text into an array of objects keyed by headers
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines.shift().split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(h => h.trim());
  return lines.map(line => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = cols[idx] !== undefined ? cols[idx].replace(/^"|"$/g, '').trim() : '';
    });
    return obj;
  });
}

// Convert array of objects into a map keyed by Category field and value from provided key
function rowsToMap(rows, valueKey) {
  const map = {};
  rows.forEach(row => {
    const cat = row['Category'] || row['Category '];
    if (!cat) return;
    map[cat] = parseFloat(row[valueKey]) || 0;
  });
  return map;
}

// Compute average BEI per category from an array of brand rows
function computeAvgBei(rows) {
  const sums = {};
  const counts = {};
  rows.forEach(row => {
    const cat = row['Category'];
    const bsiVal = parseFloat(row['BSI']);
    if (!cat || isNaN(bsiVal)) return;
    const canonical = canonCategory(cat);
    sums[canonical] = (sums[canonical] || 0) + bsiVal;
    counts[canonical] = (counts[canonical] || 0) + 1;
  });
  const avg = {};
  Object.keys(sums).forEach(key => {
    avg[key] = sums[key] / counts[key];
  });
  return avg;
}

(function () {
  // Data state
  let dtbkMap = {};
  let compMap = {};
  let skuMap = {};
  let avgBeiMap = {};
  let totalSkus = 0;

  // Chart instance holder
  let chartInstance;

  // DOM elements
  const dtbkFileInput = document.getElementById('dtbkFile');
  const compFileInput = document.getElementById('compFile');
  const beiFileInput = document.getElementById('beiFile');
  const skuFileInput = document.getElementById('skuFile');
  const wtDTBKInput = document.getElementById('wtDTBK');
  const wtCompInput = document.getElementById('wtComp');
  const wtBEIInput = document.getElementById('wtBEI');
  const totalSkusInput = document.getElementById('totalSkusInput');
  const runBtn = document.getElementById('runBtn');
  const resultsDiv = document.getElementById('resultsDiv');
  const canvas = document.getElementById('chartCanvas');

  // Utility to sum an object's values
  const sumValues = obj => Object.values(obj).reduce((a, b) => a + Number(b || 0), 0);

  // File readers
  dtbkFileInput.addEventListener('change', async (e) => {
    // When a user uploads their own category mix CSV we need to infer which
    // column contains the DTBK percentages. Many exports label this
    // differently (e.g. "DTBK %", "Mix", "Pct"). We detect the first
    // numeric column other than the category.
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) {
      dtbkMap = {};
      updateOutputs();
      return;
    }
    // Determine the value column: prefer headers containing pct/mix/dtbk/%
    const headers = Object.keys(rows[0]);
    let valueKey = null;
    // search for common patterns
    const patterns = [/pct/i, /mix/i, /dtbk/i, /share/i, /%/];
    for (const pat of patterns) {
      valueKey = headers.find(h => pat.test(h));
      if (valueKey) break;
    }
    // Fallback: choose the second column if present (index 1)
    if (!valueKey) {
      valueKey = headers[1];
    }
    dtbkMap = rowsToMap(rows, valueKey);
    updateOutputs();
  });

  compFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const text = await file.text();
    if (ext === 'json') {
      try {
        compMap = JSON.parse(text);
      } catch (err) {
        console.error('Invalid JSON:', err);
      }
    } else {
      const rows = parseCSV(text);
      // competitor CSV may have a variety of column names (e.g. "Competitor_Pct",
      // "Market Mix", "OCM %"). Detect the first header that looks like a
      // percentage column. Use the second column as a fallback.
      const headers = Object.keys(rows[0] || {});
      let valueKey = null;
      const patterns = [/comp/i, /bench/i, /ocm/i, /market/i, /pct/i, /mix/i, /share/i, /%/];
      for (const pat of patterns) {
        valueKey = headers.find(h => pat.test(h));
        if (valueKey) break;
      }
      if (!valueKey) valueKey = headers[1];
      compMap = rowsToMap(rows, valueKey);
    }
    updateOutputs();
  });

  beiFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    avgBeiMap = computeAvgBei(rows);
    updateOutputs();
  });

  skuFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    skuMap = {};
    rows.forEach(row => {
      const cat = row['Category'];
      const cnt = parseFloat(row['Current_SKUs']);
      if (cat) skuMap[cat] = cnt;
    });
    // update total SKUs input if not set
    totalSkus = sumValues(aggregateMap(skuMap));
    if (!totalSkusInput.value) totalSkusInput.value = totalSkus;
    updateOutputs();
  });

  runBtn.addEventListener('click', () => {
    updateOutputs();
  });

  function updateOutputs() {
    // Determine effective weights
    const wDT = parseFloat(wtDTBKInput.value) || 0;
    const wCP = parseFloat(wtCompInput.value) || 0;
    const wBE = parseFloat(wtBEIInput.value) || 0;
    const weightSum = wDT + wCP + wBE;

    // Use local copies of aggregated maps to avoid mutating originals
    const dtMap = aggregateMap(dtbkMap);
    const cpMap = aggregateMap(compMap);
    const beiMap = aggregateMap(avgBeiMap);
    const skMap = aggregateMap(skuMap);

    // Compute totalSkus from input or derived
    let total = parseFloat(totalSkusInput.value);
    if (!total || total <= 0) {
      total = sumValues(skMap);
      totalSkusInput.value = total;
    }

    // Build rows
    const categories = Array.from(new Set([
      ...Object.keys(dtMap),
      ...Object.keys(cpMap),
      ...Object.keys(beiMap),
      ...Object.keys(skMap)
    ]));
    const rows = categories.map(cat => {
      const dtVal = dtMap[cat] || 0;
      const cpVal = cpMap[cat] || 0;
      const beiVal = beiMap[cat] || 0;
      const optVal = weightSum > 0 ? ((wDT * dtVal + wCP * cpVal + wBE * beiVal) / weightSum) : 0;
      const skVal = skMap[cat] || 0;
      const target = total > 0 ? (optVal * total / 100) : 0;
      const gap = target - skVal;
      return {
        Category: cat,
        dtbk: dtVal.toFixed(1),
        comp: cpVal.toFixed(1),
        bei: beiVal ? beiVal.toFixed(1) : '0.0',
        opt: optVal.toFixed(1),
        skus: Math.round(skVal),
        target: Math.round(target),
        gap: Math.round(gap)
      };
    });
    renderTable(rows);
    drawBarChart(rows);
  }

  function renderTable(rows) {
    let html = '<table><thead><tr>' +
      '<th>Category</th>' +
      '<th>DTBK %</th>' +
      '<th>Competitor %</th>' +
      '<th>BEI</th>' +
      '<th>Optimised %</th>' +
      '<th>Current SKUs</th>' +
      '<th>Target SKUs</th>' +
      '<th>Gap</th>' +
      '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>' +
        `<td>${row.Category}</td>` +
        `<td>${row.dtbk}</td>` +
        `<td>${row.comp}</td>` +
        `<td>${row.bei}</td>` +
        `<td>${row.opt}</td>` +
        `<td>${row.skus}</td>` +
        `<td>${row.target}</td>` +
        `<td>${row.gap}</td>` +
        '</tr>';
    });
    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
  }

  function drawBarChart(rows) {
    const labels = rows.map(r => r.Category);
    const dtData = rows.map(r => parseFloat(r.dtbk));
    const cpData = rows.map(r => parseFloat(r.comp));
    const optData = rows.map(r => parseFloat(r.opt));
    const data = {
      labels: labels,
      datasets: [
        {
          label: 'DTBK %',
          data: dtData,
          backgroundColor: 'rgba(54, 162, 235, 0.5)'
        },
        {
          label: 'Competitor %',
          data: cpData,
          backgroundColor: 'rgba(255, 99, 132, 0.5)'
        },
        {
          label: 'Optimised %',
          data: optData,
          backgroundColor: 'rgba(75, 192, 192, 0.5)'
        }
      ]
    };
    const config = {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        scales: {
          x: { stacked: false },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Percentage (%)'
            }
          }
        }
      }
    };
    if (chartInstance) {
      chartInstance.destroy();
    }
    chartInstance = new Chart(canvas.getContext('2d'), config);
  }

  // Autoload defaults on page load
  async function loadDefaults() {
    try {
      const res = await fetch('data/preload_mix.json');
      if (res.ok) {
        const preload = await res.json();
        dtbkMap = preload.dtbk || {};
        compMap = preload.comp || {};
        skuMap = preload.skus || {};
        avgBeiMap = preload.avg_bsi || preload.avgBei || {};
        if (preload.totalSkus) {
          totalSkusInput.value = preload.totalSkus;
        }
        if (preload.weights) {
          wtDTBKInput.value = preload.weights.dtbk !== undefined ? preload.weights.dtbk : wtDTBKInput.value;
          wtCompInput.value = preload.weights.comp !== undefined ? preload.weights.comp : wtCompInput.value;
          wtBEIInput.value = preload.weights.bei !== undefined ? preload.weights.bei : wtBEIInput.value;
        }
      }
    } catch (err) {
      console.warn('Could not load defaults:', err);
    }
    updateOutputs();
  }

  loadDefaults();
})();
