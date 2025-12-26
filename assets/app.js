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

function limparCabecalho(txt){
  const linhas = txt.split("\n");
  const i = linhas.findIndex(l => l.includes(";201"));
  return linhas.slice(i).join("\n");
}

function carregar(dimensao){
  if(dimensao === "total"){
    carregarTotal();
    return;
  }

  fetch(arquivos[dimensao])
    .then(r=>r.text())
    .then(txt=>{
      const csv = limparCabecalho(txt);
      dados = Papa.parse(csv,{delimiter:";",header:true}).data;

      anos = Object.keys(dados[0]).filter(a=>/^\d{4}$/.test(a));

      montarCategorias(Object.keys(dados[0])[0]);
    });
}

function carregarTotal(){
  fetch(arquivos.estados)
    .then(r=>r.text())
    .then(txt=>{
      const csv = limparCabecalho(txt);
      const rows = Papa.parse(csv,{delimiter:";",header:true}).data;
      const total = rows.find(r=>r[Object.keys(r)[0]]==="Total");

      anos = Object.keys(total).filter(a=>/^\d{4}$/.test(a));
      desenhar("Brasil", anos.map(a=>Number(total[a].replace(/\./g,""))));
    });
}

function montarCategorias(coluna){
  const sel = document.getElementById("categoria");
  sel.innerHTML = "";

  dados.forEach(r=>{
    const o=document.createElement("option");
    o.value=r[coluna];
    o.textContent=r[coluna];
    sel.appendChild(o);
  });

  atualizar(coluna, sel.value);
}

function atualizar(coluna, categoria){
  const linha = dados.find(r=>r[coluna]===categoria);
  const valores = anos.map(a=>{
    const v=linha[a];
    return v ? Number(v.replace(/\./g,"")) : 0;
  });
  desenhar(categoria, valores);
}

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

document.getElementById("dimensao").onchange=e=>{
  carregar(e.target.value);
};

document.getElementById("categoria").onchange=e=>{
  const coluna = Object.keys(dados[0])[0];
  atualizar(coluna, e.target.value);
};

carregar("total");
