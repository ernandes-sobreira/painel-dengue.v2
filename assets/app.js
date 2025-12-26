
/* painel-dengue.v2 — app.js
   - Lê CSVs da pasta /data
   - Leaflet: mapa de estados (Brasil) e municípios por UF (carrega sob demanda)
   - Chart.js: séries temporais e sazonalidade
*/

const DATA = {
  uf: "data/dados-dengue-estados.csv",
  mun: "data/dados-dengue-municipios.csv",
  sexo: "data/dados-dengue-sexo.csv",
  raca: "data/dados-dengue-raca.csv",
  esc: "data/dados-dengue-escolaridade.csv",
  faixa: "data/dados-dengue-faixa_etaria.csv",
};

// GeoJSON (fontes públicas)
const GEO = {
  states: "https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/main/geojson/br_states.json",
  munByUf: (ufCode) => `https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${ufCode}-mun.json`,
};

// ---------- helpers ----------
const el = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("pt-BR");
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function setChip(id, text, tone=""){
  const e = el(id);
  e.textContent = text;
  e.style.borderColor = tone === "ok" ? "rgba(32,201,151,.35)" :
                        tone === "warn" ? "rgba(255,176,32,.35)" :
                        tone === "danger" ? "rgba(255,93,93,.35)" :
                        "rgba(255,255,255,.12)";
}

function parseSinanCsv(text){
  // Arquivos vêm com 3-4 linhas de metadados antes da tabela.
  // Encontra a primeira linha que parece header (contém ';' e aspas) e parseia dali.
  const lines = text.replace(/\r\n/g,"\n").split("\n");
  let start = 0;
  for(let i=0;i<Math.min(lines.length, 30);i++){
    if(lines[i].trim().startsWith('"') && lines[i].includes('";')){
      start = i; break;
    }
  }
  const body = lines.slice(start).join("\n");
  const parsed = Papa.parse(body, { delimiter: ";", header: true, skipEmptyLines: true });
  // Remove rodapé (Fonte/Notas) se tiver virado "linha" sem colunas
  const data = (parsed.data || []).filter(r => {
    const k0 = Object.keys(r)[0];
    const v0 = (r[k0]||"").toString();
    if(v0.startsWith("Fonte:") || v0.startsWith("Notas:") || v0.startsWith("Fonte") || v0.startsWith("Notas")) return false;
    return true;
  });
  return data;
}

function coerceNumber(v){
  if(v === null || v === undefined) return null;
  const s = (""+v).trim();
  if(s === "" || s === "-" ) return null;
  const n = Number(s.replace(/\./g,"").replace(",","."));
  return Number.isFinite(n) ? n : null;
}

function extractLeadingInt(s){
  const m = (""+s).trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractMunCodeAndName(s){
  // "110001 ALTA FLORESTA..." -> {code:110001, name:"ALTA FLORESTA..."}
  const t = (""+s).trim();
  const m = t.match(/^(\d{6,7})\s+(.+)$/);
  if(m) return { code: parseInt(m[1],10), name: m[2].trim() };
  // casos do tipo "MUNICIPIO IGNORADO - RO"
  return { code: null, name: t };
}

function yearsFromWideRow(row){
  return Object.keys(row)
    .filter(k => /^\d{4}$/.test(k))
    .map(k => parseInt(k,10))
    .sort((a,b)=>a-b);
}

function toWideIndex(rows, keyCol){
  // rows: [{keyCol: "...", "2013":"...", ...}]
  // return { years: [...], keys:[...], values: Map(key -> Map(year->num)) }
  const years = yearsFromWideRow(rows[0] || {});
  const values = new Map();
  const keys = [];
  for(const r of rows){
    const k = (r[keyCol] ?? "").toString().trim();
    if(!k) continue;
    keys.push(k);
    const m = new Map();
    for(const y of years){
      m.set(y, coerceNumber(r[y]));
    }
    values.set(k, m);
  }
  return { years, keys, values };
}

function quantileBreaks(vals, k=5){
  const v = vals.filter(x=>Number.isFinite(x)).sort((a,b)=>a-b);
  if(v.length === 0) return [0,1,2,3,4,5];
  const br = [];
  for(let i=0;i<=k;i++){
    const p = i/k;
    const idx = Math.floor(p*(v.length-1));
    br.push(v[idx]);
  }
  // garante monotonicidade
  for(let i=1;i<br.length;i++){
    if(br[i] < br[i-1]) br[i] = br[i-1];
  }
  return br;
}

function colorFor(val, breaks){
  if(!Number.isFinite(val)) return "rgba(255,255,255,.08)";
  const k = breaks.length - 1;
  let bin = 0;
  for(let i=0;i<k;i++){
    if(val <= breaks[i+1]){ bin = i; break; }
    bin = i;
  }
  const t = k <= 1 ? 0.5 : (bin / (k-1));
  // interpolação simples entre azul (brand) e rosa (brand2)
  const c1 = [31, 140, 255];
  const c2 = [255, 61, 154];
  const r = Math.round(c1[0] + (c2[0]-c1[0])*t);
  const g = Math.round(c1[1] + (c2[1]-c1[1])*t);
  const b = Math.round(c1[2] + (c2[2]-c1[2])*t);
  return `rgba(${r},${g},${b},.68)`;
}

function makeLegend(breaks){
  const k = breaks.length - 1;
  const items = [];
  for(let i=0;i<k;i++){
    const a = breaks[i];
    const b = breaks[i+1];
    const mid = (a+b)/2;
    items.push({ label: `${fmt.format(Math.round(a))}–${fmt.format(Math.round(b))}`, color: colorFor(mid, breaks) });
  }
  return items;
}

// ---------- state ----------
const S = {
  level: "UF",     // "UF" | "MUN"
  year: 2025,
  ufCode: 51,      // default MT
  ufName: "Mato Grosso",
  selectedName: "Brasil",
  selectedValue: null,
  dataUF: null,    // wide index
  dataMUN: null,   // wide index
  series: { sexo:null, raca:null, esc:null },
  faixa: null,
  geoStates: null,
  geoMunLayer: null,
  geoStateLayer: null,
  map: null,
  chartSeries: null,
  chartSeason: null,
};

// ---------- load ----------
async function fetchText(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`Falha ao carregar: ${url}`);
  return await r.text();
}

async function loadAll(){
  setChip("mapChip","Carregando…","warn");
  const [ufTxt, munTxt, sexoTxt, racaTxt, escTxt, faixaTxt] = await Promise.all([
    fetchText(DATA.uf),
    fetchText(DATA.mun),
    fetchText(DATA.sexo),
    fetchText(DATA.raca),
    fetchText(DATA.esc),
    fetchText(DATA.faixa),
  ]);

  const ufRows = parseSinanCsv(ufTxt);
  const munRows = parseSinanCsv(munTxt);

  S.dataUF = toWideIndex(ufRows, "UF de residência");
  S.dataMUN = toWideIndex(munRows, "Município de residência");

  // séries (já vêm "long" por ano)
  S.series.sexo = parseSinanCsv(sexoTxt);
  S.series.raca = parseSinanCsv(racaTxt);
  S.series.esc  = parseSinanCsv(escTxt);

  // faixa etária (mensal por faixa)
  S.faixa = parseSinanCsv(faixaTxt);

  // anos disponíveis
  const years = S.dataUF.years.filter(y => y >= 2014); // seu metadado diz 2014-2025, mas há coluna 2013
  const yearSel = el("yearSel");
  yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  S.year = years[years.length-1];
  yearSel.value = String(S.year);

  // UF selector (a partir da coluna "UF de residência")
  const ufSel = el("ufSel");
  const ufs = S.dataUF.keys
    .filter(k => k !== "Total")
    .map(k => {
      const code = extractLeadingInt(k); // "51 Mato Grosso"
      const name = k.replace(/^\d+\s*/,"").trim();
      return { code, name, raw:k };
    })
    .filter(x => Number.isFinite(x.code))
    .sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));

  ufSel.innerHTML = ufs.map(u => `<option value="${u.code}" data-raw="${u.raw}">${u.name} (${u.code})</option>`).join("");
  // default MT (51) se existir
  ufSel.value = ufs.some(u=>u.code===51) ? "51" : String(ufs[0].code);

  const mt = ufs.find(u=>u.code===parseInt(ufSel.value,10));
  if(mt){ S.ufCode = mt.code; S.ufName = mt.name; }

  // categoria selector (series)
  rebuildCatSelector();
  rebuildAgeSelector();

  // mapa e charts
  initMap();
  initCharts();

  // carrega geojson estados
  S.geoStates = await (await fetch(GEO.states)).json();
  drawStatesLayer();

  // render inicial
  updateKpis();
  updateSeriesChart();
  updateSeasonChart();
  updateInsights();

  setChip("mapChip","Pronto","ok");
}

function rebuildCatSelector(){
  const seriesSel = el("seriesSel").value;
  const catSel = el("catSel");
  catSel.disabled = false;

  if(seriesSel === "total"){
    catSel.innerHTML = `<option value="Total">Total</option>`;
    catSel.value = "Total";
    catSel.disabled = true;
    return;
  }

  const rows = seriesSel === "sexo" ? S.series.sexo :
               seriesSel === "raca" ? S.series.raca : S.series.esc;
  const cols = Object.keys(rows[0] || {}).filter(k => k !== "Ano notificação");
  // remove Total (mas mantém se usuário quiser)
  const preferred = cols.filter(c => c !== "Total");
  const options = preferred.concat(cols.includes("Total") ? ["Total"] : []);
  catSel.innerHTML = options.map(c => `<option value="${c}">${c}</option>`).join("");
  catSel.value = options[0];
}

function rebuildAgeSelector(){
  const ageSel = el("ageSel");
  const ages = (S.faixa || []).map(r => (r["Faixa Etária"] || "").toString().trim()).filter(Boolean);
  ageSel.innerHTML = ages.map(a => `<option value="${a}">${a}</option>`).join("");
  // default: 20–39 se existir, senão primeiro
  const preferred = ages.find(a => /20/i.test(a) || /20-39/.test(a));
  ageSel.value = preferred || ages[0] || "";
}

// ---------- map ----------
function initMap(){
  S.map = L.map("map", { zoomControl: true }).setView([-14.5, -52.5], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(S.map);
}

function drawStatesLayer(){
  if(S.geoStateLayer) S.geoStateLayer.remove();

  const year = S.year;
  const values = new Map(); // code -> value
  for(const rawKey of S.dataUF.keys){
    if(rawKey === "Total") continue;
    const code = extractLeadingInt(rawKey);
    const v = S.dataUF.values.get(rawKey)?.get(year);
    values.set(code, v);
  }
  const breaks = quantileBreaks(Array.from(values.values()), 5);
  renderLegend(breaks);

  function style(feature){
    const code = feature.properties?.codigo_ibge || feature.properties?.id || feature.properties?.code || feature.properties?.CODIGO || feature.properties?.sigla;
    // o dataset de estados pode ter "SIGLA_UF" etc — tentamos número primeiro:
    let ufCode = null;
    if(typeof code === "number") ufCode = code;
    else if(typeof code === "string" && /^\d+$/.test(code)) ufCode = parseInt(code,10);

    // fallback: alguns geojson trazem "sigla" ("MT") — sem código numérico
    // nesse caso tentamos mapear pelo nome
    let v = null;
    if(ufCode !== null) v = values.get(ufCode);
    if(v === null && v !== 0){
      const name = (feature.properties?.name || feature.properties?.nome || feature.properties?.state || "").toString().trim();
      // compara com nomes da sua tabela
      for(const [raw, m] of S.dataUF.values.entries()){
        if(raw === "Total") continue;
        const nm = raw.replace(/^\d+\s*/,"").trim();
        if(nm.toLowerCase() === name.toLowerCase()){
          v = m.get(year);
          break;
        }
      }
    }
    return {
      weight: 1,
      color: "rgba(255,255,255,.20)",
      fillOpacity: 0.85,
      fillColor: colorFor(v, breaks),
    };
  }

  function onEachFeature(feature, layer){
    layer.on({
      click: () => {
        const props = feature.properties || {};
        const name = (props.name || props.nome || props.state || props.sigla || "UF").toString();
        // tenta achar código IBGE no geojson
        let code = props.codigo_ibge || props.id || props.code || props.CODIGO;
        code = (typeof code === "string" && /^\d+$/.test(code)) ? parseInt(code,10) : code;
        // fallback: busca pela string "11 Rondônia"
        if(!Number.isFinite(code)){
          const target = name.toLowerCase();
          for(const rawKey of S.dataUF.keys){
            const nm = rawKey.replace(/^\d+\s*/,"").trim().toLowerCase();
            if(nm === target){
              code = extractLeadingInt(rawKey);
              break;
            }
          }
        }

        const val = Number.isFinite(code)
          ? values.get(code)
          : null;

        S.selectedName = name;
        S.selectedValue = val;

        el("kpiPlace").textContent = S.selectedName;
        el("kpiCases").textContent = Number.isFinite(val) ? fmt.format(val) : "—";

        // se o usuário clicar, também prepara o modo município (opcional)
        if(Number.isFinite(code)){
          S.ufCode = code;
          const opt = [...el("ufSel").options].find(o => parseInt(o.value,10) === code);
          if(opt){
            el("ufSel").value = String(code);
            S.ufName = opt.textContent.split(" (")[0];
          }
        }

        updateInsights();
      },
      mouseover: (e) => { e.target.setStyle({ weight: 2, color: "rgba(255,255,255,.35)" }); },
      mouseout:  (e) => { S.geoStateLayer.resetStyle(e.target); },
    });
  }

  S.geoStateLayer = L.geoJSON(S.geoStates, { style, onEachFeature }).addTo(S.map);

  el("mapSub").textContent = `Estados • casos prováveis em ${year}`;
  setChip("seriesChip", "—");
}

async function drawMunicipalLayer(){
  if(S.geoMunLayer) S.geoMunLayer.remove();

  const ufCode = S.ufCode;
  const year = S.year;

  setChip("mapChip", `Carregando municípios (${ufCode})…`, "warn");
  const geo = await (await fetch(GEO.munByUf(ufCode))).json();

  // valores por município (IBGE 6-7 dígitos)
  const values = new Map();
  for(const rawKey of S.dataMUN.keys){
    if(rawKey === "Total") continue;
    const { code } = extractMunCodeAndName(rawKey);
    if(!code) continue;
    const ufFromCode = Math.floor(code/10000); // 110001 -> 11
    if(ufFromCode !== ufCode) continue;
    const v = S.dataMUN.values.get(rawKey)?.get(year);
    values.set(code, v);
  }
  const breaks = quantileBreaks(Array.from(values.values()), 5);
  renderLegend(breaks);

  function style(feature){
    const props = feature.properties || {};
    const id = props.id || props.codigo_ibge || props.cod_ibge || props.CD_MUN || props.cod;
    const code = (typeof id === "string" && /^\d+$/.test(id)) ? parseInt(id,10) : id;
    const v = Number.isFinite(code) ? values.get(code) : null;
    return {
      weight: 0.7,
      color: "rgba(255,255,255,.16)",
      fillOpacity: 0.88,
      fillColor: colorFor(v, breaks),
    };
  }

  function onEachFeature(feature, layer){
    layer.on({
      click: () => {
        const props = feature.properties || {};
        const name = (props.name || props.nome || props.NM_MUN || props.description || "Município").toString();
        const id = props.id || props.codigo_ibge || props.cod_ibge || props.CD_MUN || props.cod;
        const code = (typeof id === "string" && /^\d+$/.test(id)) ? parseInt(id,10) : id;
        const val = Number.isFinite(code) ? values.get(code) : null;

        S.selectedName = name;
        S.selectedValue = val;

        el("kpiPlace").textContent = `${name} / ${S.ufName}`;
        el("kpiCases").textContent = Number.isFinite(val) ? fmt.format(val) : "—";
        updateInsights();
      },
      mouseover: (e) => { e.target.setStyle({ weight: 1.5, color: "rgba(255,255,255,.30)" }); },
      mouseout:  (e) => { S.geoMunLayer.resetStyle(e.target); },
    });
  }

  S.geoMunLayer = L.geoJSON(geo, { style, onEachFeature }).addTo(S.map);

  el("mapSub").textContent = `Municípios • ${S.ufName} • casos prováveis em ${year}`;
  setChip("mapChip", "Pronto", "ok");
}

// ---------- legend ----------
function renderLegend(breaks){
  const legend = el("legend");
  const items = makeLegend(breaks);
  legend.innerHTML = `
    <div><b>Escala</b> (quantis)</div>
    ${items.map(it => `
      <div class="sw"><span class="box" style="background:${it.color}"></span><span>${it.label}</span></div>
    `).join("")}
    <div class="muted">clique no mapa para resumo</div>
  `;
}

// ---------- charts ----------
function initCharts(){
  // Série temporal
  const ctx1 = el("chartSeries");
  S.chartSeries = new Chart(ctx1, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: true, labels:{ color: "rgba(255,255,255,.82)" } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y || 0)}` } }
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,.72)" }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: "rgba(255,255,255,.72)" }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });

  // Sazonalidade
  const ctx2 = el("chartSeason");
  S.chartSeason = new Chart(ctx2, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${fmt.format(ctx.parsed.y || 0)}` } }
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,.72)" }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: "rgba(255,255,255,.72)" }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

function updateSeriesChart(){
  const mode = el("seriesSel").value;
  const cat = el("catSel").value;

  if(mode === "total"){
    // usa total da tabela UF (linha "Total")
    const totalRow = S.dataUF.values.get("Total");
    const years = S.dataUF.years.filter(y=>y>=2014);
    const vals = years.map(y => totalRow?.get(y) ?? null);

    S.chartSeries.data.labels = years.map(String);
    S.chartSeries.data.datasets = [{
      label: "Brasil (Total)",
      data: vals,
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.25
    }];
    el("seriesSub").textContent = "Brasil • casos prováveis por ano";
    setChip("seriesChip", `Total`, "ok");
    S.chartSeries.update();
    return;
  }

  const rows = mode === "sexo" ? S.series.sexo :
               mode === "raca" ? S.series.raca : S.series.esc;

  const years = rows.map(r => parseInt(r["Ano notificação"],10)).filter(Number.isFinite);
  const series = rows.map(r => coerceNumber(r[cat]));

  S.chartSeries.data.labels = years.map(String);
  S.chartSeries.data.datasets = [{
    label: cat,
    data: series,
    borderWidth: 2,
    pointRadius: 2,
    tension: 0.25
  }];
  const labelNice = mode === "sexo" ? "Sexo" : mode === "raca" ? "Raça/cor" : "Escolaridade";
  el("seriesSub").textContent = `${labelNice} • ${cat} • casos por ano`;
  setChip("seriesChip", labelNice, "ok");
  S.chartSeries.update();
}

function updateSeasonChart(){
  const age = el("ageSel").value;
  const row = (S.faixa || []).find(r => (r["Faixa Etária"]||"").toString().trim() === age);
  if(!row){
    setChip("seasonChip", "Sem dados", "warn");
    return;
  }
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const vals = months.map(m => coerceNumber(row[m]));
  S.chartSeason.data.labels = months;
  S.chartSeason.data.datasets = [{
    label: age,
    data: vals,
    borderWidth: 0,
  }];
  el("seasonSub").textContent = `Faixa etária • ${age} • distribuição mensal`;
  setChip("seasonChip", "Sazonalidade", "ok");
  S.chartSeason.update();
}

// ---------- insights ----------
function updateKpis(){
  el("kpiYear").textContent = String(S.year);
  el("kpiPlace").textContent = S.level === "UF" ? (S.selectedName || "Brasil") : (S.selectedName || `${S.ufName}`);
  el("kpiCases").textContent = Number.isFinite(S.selectedValue) ? fmt.format(S.selectedValue) : "—";
}

function pct(a,b){
  if(!Number.isFinite(a) || !Number.isFinite(b) || b===0) return null;
  return (a/b)*100;
}

function updateInsights(){
  const y = S.year;
  const place = el("kpiPlace").textContent;
  const cases = S.selectedValue;

  const totalBR = S.dataUF.values.get("Total")?.get(y);
  const share = pct(cases, totalBR);

  // trend: último ano vs anterior
  const prev = S.level === "UF"
    ? inferValueForSelectedUF(y-1)
    : inferValueForSelectedMun(y-1);

  let trend = null;
  if(Number.isFinite(cases) && Number.isFinite(prev)){
    trend = ((cases - prev) / (prev || 1))*100;
  }

  const parts = [];
  if(Number.isFinite(cases)){
    parts.push(`<b>${place}</b> registrou <b>${fmt.format(cases)}</b> casos prováveis de dengue em <b>${y}</b>.`);
  }else{
    parts.push(`<b>${place}</b> • sem valor detectável para <b>${y}</b> (provável ausência/ignorado).`);
  }

  if(Number.isFinite(totalBR) && Number.isFinite(share)){
    parts.push(`Isso representa <b>${share.toFixed(2).replace(".",",")}%</b> do total do Brasil no mesmo ano.`);
  }

  if(trend !== null){
    const sign = trend >= 0 ? "aumento" : "redução";
    parts.push(`Em relação a <b>${y-1}</b>, houve <b>${sign}</b> de <b>${Math.abs(trend).toFixed(1).replace(".",",")}%</b>.`);
  }

  parts.push(`<div class="muted" style="margin-top:10px">Leitura rápida: priorize vigilância e controle vetorial nos meses de pico (veja sazonalidade) e monitore grupos com maior exposição (sexo/raça/escolaridade).</div>`);

  el("insights").innerHTML = parts.join(" ");
  setChip("insightsChip", "Resumo", "ok");
}

function inferValueForSelectedUF(year){
  if(!Number.isFinite(year)) return null;
  // tenta achar UF pelo select
  if(S.selectedName && S.selectedName !== "Brasil"){
    // encontra por nome
    const target = S.selectedName.toLowerCase();
    for(const rawKey of S.dataUF.keys){
      if(rawKey === "Total") continue;
      const nm = rawKey.replace(/^\d+\s*/,"").trim().toLowerCase();
      if(nm === target){
        return S.dataUF.values.get(rawKey)?.get(year) ?? null;
      }
    }
  }
  return null;
}

function inferValueForSelectedMun(year){
  // para município não temos o code guardado; melhor usar o valor anterior só quando selecionado
  // aqui fazemos fallback: não calcula
  return null;
}

// ---------- UI wiring ----------
function setLevel(level){
  S.level = level;
  const isUF = level === "UF";
  el("levelUF").classList.toggle("on", isUF);
  el("levelMUN").classList.toggle("on", !isUF);
  el("levelUF").setAttribute("aria-selected", isUF ? "true" : "false");
  el("levelMUN").setAttribute("aria-selected", !isUF ? "true" : "false");
  el("ufSel").disabled = isUF ? true : false;

  // limpa seleção
  S.selectedName = isUF ? "Brasil" : `${S.ufName}`;
  S.selectedValue = null;
  updateKpis();
  updateInsights();

  // troca camada
  if(isUF){
    if(S.geoMunLayer) S.geoMunLayer.remove();
    drawStatesLayer();
  }else{
    if(S.geoStateLayer) S.geoStateLayer.remove();
    drawMunicipalLayer();
  }

  el("mapSub").textContent = isUF
    ? `Estados • casos prováveis em ${S.year}`
    : `Municípios • ${S.ufName} • casos prováveis em ${S.year}`;
}

function hookEvents(){
  el("yearSel").addEventListener("change", () => {
    S.year = parseInt(el("yearSel").value,10);
    el("kpiYear").textContent = String(S.year);

    // atualiza mapa
    if(S.level === "UF") drawStatesLayer();
    else drawMunicipalLayer();

    // atualiza insights
    updateKpis();
    updateInsights();
  });

  el("ufSel").addEventListener("change", () => {
    S.ufCode = parseInt(el("ufSel").value,10);
    S.ufName = el("ufSel").selectedOptions[0].textContent.split(" (")[0];
    if(S.level === "MUN") drawMunicipalLayer();
  });

  el("seriesSel").addEventListener("change", () => {
    rebuildCatSelector();
    updateSeriesChart();
  });

  el("catSel").addEventListener("change", () => updateSeriesChart());

  el("ageSel").addEventListener("change", () => updateSeasonChart());

  el("levelUF").addEventListener("click", () => setLevel("UF"));
  el("levelMUN").addEventListener("click", () => setLevel("MUN"));

  el("btnReset").addEventListener("click", () => {
    el("yearSel").value = String(S.dataUF.years.filter(y=>y>=2014).slice(-1)[0]);
    S.year = parseInt(el("yearSel").value,10);
    el("seriesSel").value = "total";
    rebuildCatSelector();
    el("ageSel").selectedIndex = 0;
    S.selectedName = "Brasil";
    S.selectedValue = null;
    setLevel("UF");
    updateSeriesChart();
    updateSeasonChart();
  });

  // about dialog
  const dlg = el("aboutDlg");
  el("btnAbout").addEventListener("click", () => dlg.showModal());
  el("btnCloseAbout").addEventListener("click", () => dlg.close());
}

// boot
hookEvents();
loadAll().catch(err => {
  console.error(err);
  setChip("mapChip", "Erro ao carregar", "danger");
  el("insights").innerHTML = `<div class="muted">Erro: ${err.message}</div>`;
});
