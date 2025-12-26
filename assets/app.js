const arquivos = {
  estados: "data/dados-dengue-estados.csv",
  municipios: "data/dados-dengue-municipios.csv",
  sexo: "data/dados-dengue-sexo.csv",
  raca: "data/dados-dengue-raca.csv",
  escolaridade: "data/dados-dengue-escolaridade.csv"
};

let chart;
let dados = [];
let anos = [];

/* ===============================
   LIMPA CSV SINAN (ROBUSTO)
================================ */
function limparCabecalho(txt){
  const linhas = txt.split(/\r?\n/);

  const idx = linhas.findIndex(l =>
    l.startsWith("UF de residência") ||
    l.startsWith("Município de residência") ||
    l.startsWith("Ano notificação")
  );

  if(idx === -1){
    console.error("Cabeçalho não encontrado");
    return "";
  }

  return linhas.slice(idx).join("\n");
}

/* ===============================
   CONVERSÃO SEGURA DE NÚMEROS
================================ */
function num(v){
  if(!v) return 0;
  return Number(v.replace(/\./g,"").replace(",", ".")) || 0;
}

/* ===============================
   CARREGAMENTO PRINCIPAL
================================ */
function carregar(dimensao){
  if(dimensao === "total"){
    carregarTotalBrasil();
    return;
  }

  fetch(arquivos[dimensao])
    .then(r=>r.text())
    .then(txt=>{
      const csv = limparCabecalho(txt);
      dados = Papa.parse(csv,{
        delimiter:";",
        header:true,
        skipEmptyLines:true
      }).data;

      dados = dados.filter(d => d && Object.values(d).some(v => v));

      if(dimensao === "estados" || dimensao === "municipios"){
        anos = Object.keys(dados[0]).filter(a=>/^\d{4}$/.test(a));
        montarCategorias(Object.keys(dados[0])[0]);
      } else {
        anos = dados.map(d => d["Ano notificação"]);
        montarCategorias("colunas");
      }
    });
}

/* ===============================
   TOTAL BRASIL
================================ */
function carregarTotalBrasil(){
  fetch(arquivos.estados)
    .then(r=>r.text())
    .then(txt=>{
      const csv = limparCabecalho(txt);
      const rows = Papa.parse(csv,{delimiter:";",header:true}).data;
      const total = rows.find(r => r["UF de residência"] === "Total");

      anos = Object.keys(total).filter(a=>/^\d{4}$/.test(a));
      desenhar("Brasil", anos.map(a => num(total[a])));
      document.getElementById("categoria").innerHTML = "";
    });
}

/* ===============================
   CATEGORIAS
================================ */
function montarCategorias(tipo){
  const sel = document.getElementById("categoria");
  sel.innerHTML = "";

  if(tipo === "colunas"){
    const cols = Object.keys(dados[0]).filter(c => c !== "Ano notificação");
    cols.forEach(c=>{
      const o=document.createElement("option");
      o.value=c;
      o.textContent=c;
      sel.appendChild(o);
    });
    atualizarColuna(cols[0]);
  } else {
    dados.forEach(r=>{
      const o=document.createElement("option");
      o.value=r[tipo];
      o.textContent=r[tipo];
      sel.appendChild(o);
    });
    atualizarLinha(tipo, sel.value);
  }
}

/* ===============================
   ATUALIZAÇÕES
================================ */
function atualizarLinha(coluna, valor){
  const linha = dados.find(d => d[coluna] === valor);
  const valores = anos.map(a => num(linha[a]));
  desenhar(valor, valores);
}

function atualizarColuna(coluna){
  const valores = dados.map(d => num(d[coluna]));
  desenhar(coluna, valores);
}

/* ===============================
   DESENHO DO GRÁFICO
================================ */
function desenhar(label, valores){
  if(chart) chart.destroy();

  chart = new Chart(document.getElementById("grafico"),{
    type:"line",
    data:{
      labels:anos,
      datasets:[{
        label,
        data:valores,
        borderColor:"#333",
        backgroundColor:"rgba(0,0,0,.08)",
        tension:.3,
        pointRadius:3
      }]
    },
    options:{
      responsive:true,
      scales:{
        y:{ ticks:{ callback:v=>v.toLocaleString() } }
      }
    }
  });
}

/* ===============================
   EVENTOS
================================ */
document.getElementById("dimensao").onchange = e=>{
  carregar(e.target.value);
};

document.getElementById("categoria").onchange = e=>{
  const dim = document.getElementById("dimensao").value;
  if(dim === "estados" || dim === "municipios"){
    atualizarLinha(Object.keys(dados[0])[0], e.target.value);
  } else {
    atualizarColuna(e.target.value);
  }
};

/* ===============================
   INICIAL
================================ */
carregar("total");
