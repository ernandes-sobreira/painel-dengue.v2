const arquivos = {
  sexo: "data/dados-dengue-sexo.csv",
  raca: "data/dados-dengue-raca.csv",
  escolaridade: "data/dados-dengue-escolaridade.csv"
};

let chart;
let dadosAtuais = [];

function carregarCSV(tipo){
  fetch(arquivos[tipo])
    .then(r=>r.text())
    .then(txt=>{
      const linhas = txt.split("\n");
      const inicio = linhas.findIndex(l=>l.startsWith("Ano"));
      const csvLimpo = linhas.slice(inicio).join("\n");

      dadosAtuais = Papa.parse(csvLimpo,{
        delimiter:";",
        header:true
      }).data;

      montarCategorias(tipo);
    });
}

function montarCategorias(tipo){
  const sel = document.getElementById("categoria");
  sel.innerHTML = "";

  const colunas = Object.keys(dadosAtuais[0])
    .filter(c=>c !== "Ano notificação");

  colunas.forEach(c=>{
    const o=document.createElement("option");
    o.value=c;
    o.textContent=c;
    sel.appendChild(o);
  });

  desenharGrafico(colunas[0]);
}

function desenharGrafico(coluna){
  const anos = dadosAtuais.map(d=>d["Ano notificação"]);
  const valores = dadosAtuais.map(d=>{
    const v=d[coluna];
    return v ? Number(v.replace(/\./g,"")) : 0;
  });

  if(chart) chart.destroy();

  chart = new Chart(document.getElementById("grafico"),{
    type:"line",
    data:{
      labels:anos,
      datasets:[{
        label:coluna,
        data:valores,
        borderColor:"#444",
        backgroundColor:"rgba(0,0,0,.08)",
        tension:.3,
        pointRadius:3
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:true}},
      scales:{
        y:{
          ticks:{callback:v=>v.toLocaleString()}
        }
      }
    }
  });
}

document.getElementById("tipo").onchange=e=>{
  carregarCSV(e.target.value);
};

document.getElementById("categoria").onchange=e=>{
  desenharGrafico(e.target.value);
};

carregarCSV("sexo");
