
// === Category normalization (merge Vape = Disposable = Vapor Pens) ===
function canonCategory(c){
  if(!c) return "";
  c = String(c).trim().toLowerCase();
  if(c.includes("vape") || c.includes("disposable")) return "Vapor Pens";
  if(c.startsWith("pre")) return "Pre-Rolls";
  if(c.includes("flower")) return "Flower";
  if(c.includes("edible")) return "Edibles";
  if(c.includes("beverage")) return "Beverages";
  if(c.includes("concentrate")) return "Concentrates";
  if(c.includes("tincture")) return "Tinctures";
  if(c.includes("topical")) return "Topicals";
  if(c.startsWith("cbd")) return "CBD";
  return c.charAt(0).toUpperCase()+c.slice(1);
}
function aggregateByCanon(mapObj){
  const out = {};
  Object.entries(mapObj||{}).forEach(([k,v])=>{
    const key = canonCategory(k);
    const val = Number(v)||0;
    out[key] = (out[key]||0) + val;
  });
  return out;
}

function renderCompTable(_){}; function loadCompetitors(){}
async function getDTBK(){return {}}
async function getBEI(){return {}}
async function getSKUs(){return {}}
function getComp(){return {}}
function renderOut(_){}; function drawChart(_){};
function autoloadPreload(){}
document.getElementById?.('runBtn')?.addEventListener('click', async ()=>{
  const dtbkMap = await getDTBK();
  const compMap = getComp();
  const beiMap  = await getBEI();
  const skuMap  = await getSKUs();
  const cats = Array.from(new Set([...Object.keys(compMap),...Object.keys(dtbkMap),...Object.keys(beiMap||{}),...Object.keys(skuMap||{})]));
  const rows = cats.map(cat=>({Category:cat, dtbk:dtbkMap[cat]||0, comp:compMap[cat]||0, bei:beiMap[cat]||0, opt:0, skus:skuMap[cat]||0, target:0, gap:0}));
  renderOut(rows); drawChart(rows);
});
