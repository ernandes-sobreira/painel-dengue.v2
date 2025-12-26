fetch("data/dados-dengue-estados.csv")
  .then(r => r.text())
  .then(txt => {

    // 1. quebrar linhas
    const linhas = txt.split(/\r?\n/);

    // 2. achar onde começa a tabela real
    const inicio = linhas.findIndex(l =>
      l.startsWith("UF de residência")
    );

    if(inicio === -1){
      console.error("Cabeçalho não encontrado");
      return;
    }

    // 3. CSV limpo
    const csv = linhas.slice(inicio).join("\n");

    // 4. parse
    const dados = Papa.parse(csv, {
      delimiter: ";",
      header: true,
      skipEmptyLines: true
    }).data;

    // 5. achar linha Total
    const total = dados.find(d => d["UF de residência"] === "Total");

    if(!total){
      console.error("Linha Total não encontrada");
      return;
    }

    // 6. anos
    const anos = Object.keys(total).filter(a => /^\d{4}$/.test(a));

    // 7. valores
    const valores = anos.map(a =>
      Number(total[a].replace(/\./g,"")) || 0
    );

    // 8. gráfico
    new Chart(document.getElementById("graficoBrasil"), {
      type: "line",
      data: {
        labels: anos,
        datasets: [{
          label: "Brasil – casos de dengue",
          data: valores,
          borderColor: "#333",
          backgroundColor: "rgba(0,0,0,.08)",
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            ticks: {
              callback: v => v.toLocaleString()
            }
          }
        }
      }
    });
});
