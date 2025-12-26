const map = L.map('map').setView([-14,-52],4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap'
}).addTo(map);

let dadosUF = {};
let anos = [];
let geoLayer;
let chart;

fetch("dados-dengue-estados.csv")
.then(r=>r.text())
.then(txt=>{
  const linhas = txt.split("\n");
  const inicio = linhas.findIndex(l=>l.startsWith('"UF'));
  const csv = linhas.slice(inicio).join("\n");

  const data = Papa.parse(csv,{delimiter:";",header:true}).data;

  // ANOS = colunas numéricas
  anos = Object.keys(data[0]).filter(c=>/^\d{4}$/.test(c));

  const anoSel = document.getElementById("ano");
  anos.forEach(a=>{
    const o=document.createElement("option");
    o.value=a;o.textContent=a;
    anoSel.appendChild(o);
  });
  anoSel.value = anos.at(-1);
  document.getElementById("anoTxt").textContent = anoSel.value;

  function processaAno(ano){
    dadosUF = {};
    data.forEach(r=>{
      if(r["UF de residência"]==="Total") return;
      const txt = r["UF de residência"];
      const i = txt.indexOf(" ");
      const codigo = txt.slice(0,i);
      const nome   = txt.slice(i+1);
      dadosUF[codigo] = {
        nome,
        valor: Number(r[ano].replace(/\./g,"")) || 0
      };
    });
  }

  processaAno(anoSel.value);

  fetch("https://raw.githubusercontent.com/fititnt/gis-dataset-brasil/master/uf/geojson/uf.json")
  .then(r=>r.json())
  .then(geo=>{
    function desenha(){
      if(geoLayer) geoLayer.remove();
      geoLayer = L.geoJSON(geo,{
        style:f=>{
          const c = f.properties.codigo_ibge;
          const v = dadosUF[c]?.valor || 0;
          return{
            fillColor: v>50000?"#7f1d1d":v>20000?"#dc2626":v>5000?"#f97316":"#fde68a",
            fillOpacity:.8,color:"#555",weight:1
          }
        },
        onEachFeature:(f,l)=>{
          l.on("click",()=>{
            const c=f.properties.codigo_ibge;
            const d=dadosUF[c];
            document.getElementById("info").innerHTML =
              `<b>${d.nome}</b>: ${d.valor.toLocaleString()} casos`;
          });
        }
      }).addTo(map);
    }

    desenha();

    anoSel.onchange=()=>{
      processaAno(anoSel.value);
      document.getElementById("anoTxt").textContent = anoSel.value;
      desenha();
      atualizaGrafico();
    };
  });

  function atualizaGrafico(){
    const total = data.find(r=>r["UF de residência"]==="Total");
    const valores = anos.map(a=>Number(total[a].replace(/\./g,"")));
    if(chart) chart.destroy();
    chart = new Chart(document.getElementById("grafico"),{
      type:"line",
      data:{
        labels:anos,
        datasets:[{
          label:"Brasil",
          data:valores,
          borderColor:"#1e40af",
          tension:.3
        }]
      }
    });
  }

  atualizaGrafico();
});
