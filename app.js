// Utility: parse CSV text into array of objects
function parseCSV(text){
  const [header,...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(',').map(s=>s.trim());
  return rows.map(line=>{
    const vals = line.split(',').map(s=>s.trim());
    const obj = {};
    cols.forEach((c,i)=>obj[c]=vals[i]);
    return obj;
  });
}

const defaultCompetitors = {
  "Flower":31.0, "Pre-Rolls":17.0, "Edibles":20.0, "Vapor Pens":25.0,
  "Beverages":2.0, "Concentrates":3.0, "Tinctures":1.0, "Topicals":1.0
};

const compTblBody = document.querySelector('#compTbl tbody');

async function loadCompetitors(){
  try{
    const resp = await fetch('./data/competitor_benchmarks.json', {cache:'no-cache'});
    const json = await resp.json();
    renderCompTable(json);
  }catch(e){
    renderCompTable(defaultCompetitors);
  }
}

function renderCompTable(obj){
  compTblBody.innerHTML = Object.entries(obj).map(([cat,val])=>{
    return `<tr><td>${cat}</td><td><input data-cat="${cat}" type="number" step="0.1" value="${Number(val)}"></td></tr>`;
  }).join('');
}

loadCompetitors();
// === Autoload preload_mix.json if present ===
async function autoloadPreload(){
  try{
    const resp = await fetch('./data/preload_mix.json', {cache:'no-cache'});
    if(!resp.ok) return;
    const pre = await resp.json();
    // Fill DTBK textarea
    if(pre.dtbk_sales_pct){
      const lines = Object.entries(pre.dtbk_sales_pct).map(([k,v])=>`${k},${v}`);
      document.getElementById('dtbkManual').value = 'Category,DTBK_Pct\n' + lines.join('\n');
    }
    // Fill competitor table
    if(pre.competitor_pct){
      renderCompTable(pre.competitor_pct);
    }
    // Fill SKU counts and total
    if(pre.sku_counts){
      // Build a temp CSV to parse into map when Run is clicked (handled by getSKUs via upload)
      // Instead, we intercept getSKUs to fallback to this preload map if no file is uploaded.
      window.__preloadSkuMap = pre.sku_counts;
      const total = Number(pre.total_skus||0);
      if(total){
        document.getElementById('totalSku').value = total;
      }
    }
  }catch(e){ /* ignore */ }
}
autoloadPreload();
// === Auto compute Avg BEI per Category from BSI + brand→category map ===
async function computeBEIFromBSI(){
  try{
    const [bsiResp, mapResp] = await Promise.all([
      fetch('./data/bsi_data.json', {cache:'no-cache'}),
      fetch('./data/brand_category_map.json', {cache:'no-cache'})
    ]);
    if(!bsiResp.ok || !mapResp.ok) return {};
    const bsi = await bsiResp.json();
    const bmap = await mapResp.json();
    const brands = bsi.brands || [];
    const agg = {}, cnt = {};
    brands.forEach(b=>{
      const brandName = (b.brand||'').trim();
      const cat = (bmap[brandName]||'').trim();
      const score = Number(b.BSI||b.bsi||0);
      if(cat && isFinite(score) && score>0){
        agg[cat] = (agg[cat]||0) + score;
        cnt[cat] = (cnt[cat]||0) + 1;
      }
    });
    const out = {};
    Object.keys(agg).forEach(cat=> out[cat] = agg[cat]/cnt[cat]);
    return out;
  }catch(e){
    console.warn('BEI compute failed', e);
    return {};
  }
}

// Hook BEI autoload into preload flow
(async function(){
  const beiCat = await computeBEIFromBSI();
  if(Object.keys(beiCat).length){
    // Stash into global for run
    window.__beiFromBSI = beiCat;
  }
})();

// Override getBEI: prefer autocomputed BEI if no upload
const _getBEI_orig = getBEI;
getBEI = async function(){
  const res = await _getBEI_orig();
  if(Object.keys(res||{}).length===0 && window.__beiFromBSI){
    return window.__beiFromBSI;
  }
  return res;
};


// Override getSKUs to use preload map if no file uploaded
const _getSKUs_orig = getSKUs;
getSKUs = async function(){
  const res = await _getSKUs_orig();
  if(Object.keys(res).length===0 && window.__preloadSkuMap){
    return window.__preloadSkuMap;
  }
  return res;
};


// Read inputs
const dtbkFile = document.getElementById('dtbkFile');
const dtbkManual = document.getElementById('dtbkManual');
const beiFile = document.getElementById('beiFile');
const skuFile = document.getElementById('skuFile');
const totalSku = document.getElementById('totalSku');

// Weights
const wDTBK = document.getElementById('wDTBK');
const wCOMP = document.getElementById('wCOMP');
const wBEI  = document.getElementById('wBEI');
const wOuts = {
  DTBK: document.getElementById('wDTBKOut'),
  COMP: document.getElementById('wCOMPOut'),
  BEI:  document.getElementById('wBEIOut')
};
[wDTBK,wCOMP,wBEI].forEach(inp=>{
  inp.addEventListener('input', ()=>{
    wOuts.DTBK.textContent = Number(wDTBK.value).toFixed(2);
    wOuts.COMP.textContent = Number(wCOMP.value).toFixed(2);
    wOuts.BEI.textContent  = Number(wBEI.value).toFixed(2);
  });
});

// Run
document.getElementById('runBtn').addEventListener('click', async ()=>{
  const dtbkMap = await getDTBK();
  const compMap = getComp();
  const beiMap  = await getBEI(); // {Category -> avg BSI}
  const skuMap  = await getSKUs();
  const total   = Number(totalSku.value)||0;

  // Build list of categories from union
  const cats = Array.from(new Set([
    ...Object.keys(compMap),
    ...Object.keys(dtbkMap),
    ...Object.keys(beiMap||{}),
    ...Object.keys(skuMap||{})
  ])).filter(Boolean);

  // Compute optimized
  const w1 = Number(wDTBK.value)||0;
  const w2 = Number(wCOMP.value)||0;
  const w3 = Number(wBEI.value)||0;
  const rows = cats.map(cat=>{
    const d = Number(dtbkMap[cat]||0);
    const c = Number(compMap[cat]||0);
    const b = Number(beiMap[cat]||0); // Already normalized 0..100; scale to 0..1
    const bN = b ? (b/100)*100 : 0; // keep as percent contribution
    const opt = (w1*d) + (w2*c) + (w3*bN);
    const skus = Number(skuMap[cat]||0);
    const target = total ? Math.round(total*opt/100) : 0;
    return {Category:cat, dtbk:d, comp:c, bei: b? b.toFixed(1):"", opt: Number(opt.toFixed(1)), skus, target, gap: target - skus};
  });

  renderOut(rows);
  drawChart(rows);
});

async function getDTBK(){
  // Prefer file; fallback to textarea
  let text = "";
  if(dtbkFile.files && dtbkFile.files[0]){
    text = await dtbkFile.files[0].text();
  }else{
    text = dtbkManual.value;
  }
  const rows = parseCSV(text);
  const map = {};
  rows.forEach(r=>{
    const cat = (r.Category||"").trim();
    const v   = parseFloat(r.DTBK_Pct||r.DTBK||r["DTBK %"]||r.Value||0);
    if(cat) map[cat] = isFinite(v)? v : 0;
  });
  return map;
}

function getComp(){
  const map={};
  compTblBody.querySelectorAll('input').forEach(inp=>{
    map[inp.dataset.cat] = parseFloat(inp.value)||0;
  });
  return map;
}

// Brand strength input can be CSV (Brand,Category,BSI) or a bsi_data.json + mapping (Brand,Category)
async function getBEI(){
  if(!(beiFile.files && beiFile.files[0])) return {};
  const f = beiFile.files[0];
  const name = f.name.toLowerCase();
  if(name.endsWith(".csv")){
    const text = await f.text();
    const rows = parseCSV(text);
    const agg = {};
    const cnt = {};
    rows.forEach(r=>{
      const cat=(r.Category||"").trim();
      const b=parseFloat(r.BSI||r.Score||r.BEI||0);
      if(!cat || !isFinite(b)) return;
      agg[cat]=(agg[cat]||0)+b;
      cnt[cat]=(cnt[cat]||0)+1;
    });
    const out={};
    Object.keys(agg).forEach(cat=> out[cat]= agg[cat]/cnt[cat]);
    return out;
  }else if(name.endsWith(".json")){
    // Expect a bsi_data.json-like structure with brands list that includes Category and BSI.
    try{
      const j = JSON.parse(await f.text());
      const list = j.brands || [];
      const agg={}, cnt={};
      list.forEach(b=>{
        const cat = (b.Category||b.category||"").trim();
        const score = Number(b.BSI||b.bsi||0);
        if(cat && isFinite(score) && score>0){
          agg[cat]=(agg[cat]||0)+score;
          cnt[cat]=(cnt[cat]||0)+1;
        }
      });
      const out={};
      Object.keys(agg).forEach(cat=> out[cat]= agg[cat]/cnt[cat]);
      return out;
    }catch(e){
      alert("Could not parse JSON. If using bsi_data.json, include a Category field or upload a CSV with Brand,Category,BSI.");
      return {};
    }
  }
  return {};
}

async function getSKUs(){
  if(!(skuFile.files && skuFile.files[0])) return {};
  const text = await skuFile.files[0].text();
  const rows = parseCSV(text);
  const map={};
  rows.forEach(r=>{
    const cat=(r.Category||"").trim();
    const v=parseFloat(r.Current_SKUs||r.SKUs||r.Count||0);
    if(cat) map[cat]= isFinite(v)? v:0;
  });
  return map;
}

function renderOut(rows){
  const tb = document.querySelector('#outTbl tbody');
  tb.innerHTML = rows.map(r=>`<tr>
    <td>${r.Category}</td>
    <td>${r.dtbk.toFixed(1)}%</td>
    <td>${r.comp.toFixed(1)}%</td>
    <td>${r.bei!==""? r.bei+"": "—"}</td>
    <td><b>${r.opt.toFixed(1)}%</b></td>
    <td>${r.skus||0}</td>
    <td>${r.target||0}</td>
    <td class="${r.gap>0?'pos':(r.gap<0?'neg':'') }">${r.gap>0? '+'+r.gap:r.gap}</td>
  </tr>`).join('');
}

let chart;
function drawChart(rows){
  const ctx = document.getElementById('mixChart').getContext('2d');
  const labels = rows.map(r=>r.Category);
  const dtbk = rows.map(r=>r.dtbk);
  const comp = rows.map(r=>r.comp);
  const opt  = rows.map(r=>r.opt);

  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'DTBK %', data:dtbk},
        {label:'Competitor %', data:comp},
        {label:'Optimized %', data:opt}
      ]
    },
    options:{
      plugins:{legend:{position:'bottom'}},
      responsive:true,
      scales:{
        y:{beginAtZero:true, ticks:{callback:(v)=>v+'%'}}
      }
    }
  });
}
