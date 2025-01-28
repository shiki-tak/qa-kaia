const fs = require('fs');
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');

async function saveChartAsImage(data, filename) {
    const canvas = createCanvas(1200, 800);
    const ctx = canvas.getContext('2d');
  
    const dataSizes = [...new Set(data.map(d => d.dataSize))].sort((a, b) => a - b);
    const testnetData = new Map();
    const localData = new Map();
  
    data.forEach(result => {
      if (result.success) {
        const gasUsed = parseInt(result.gasUsed, 16);
        if (result.networkName === 'testnet') {
          if (!testnetData.has(result.dataSize)) {
            testnetData.set(result.dataSize, []);
          }
          testnetData.get(result.dataSize).push(gasUsed);
        } else {
          if (!localData.has(result.dataSize)) {
            localData.set(result.dataSize, []);
          }
          localData.get(result.dataSize).push(gasUsed);
        }
      }
    });
  
    const testnetAverages = dataSizes.map(size => {
      const values = testnetData.get(size) || [];
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    });
  
    const localAverages = dataSizes.map(size => {
      const values = localData.get(size) || [];
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    });
  
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dataSizes,
        datasets: [
          {
            label: 'Testnet (EIP-2028 Not Applied)',
            data: testnetAverages,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            pointStyle: 'circle',
            pointRadius: 6,
            pointBorderColor: 'rgb(75, 192, 192)',
            pointBackgroundColor: 'rgba(75, 192, 192, 0.5)',
            borderDash: [5, 5] // Add a dashed line for testnet
          },
          {
            label: 'Local (EIP-2028 Applied)',
            data: localAverages,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            tension: 0.1,
            pointStyle: 'triangle',
            pointRadius: 6,
            pointBorderColor: 'rgb(255, 99, 132)',
            pointBackgroundColor: 'rgba(255, 99, 132, 0.5)'
          }
        ]
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: 'EIP-2028 Gas Cost Comparison',
            font: {
              size: 16
            }
          },
          legend: {
            position: 'top',
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const datasetLabel = context.dataset.label || '';
                const dataPoint = context.parsed.y;
                return `${datasetLabel}: ${dataPoint.toFixed(2)} gas`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Data Size (bytes)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Gas Used'
            },
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value.toLocaleString(); // Add comma separators to y-axis labels
              }
            }
          }
        },
        interaction: {
          mode: 'nearest',
          intersect: false
        }
      }
    });
  
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filename, buffer);
    console.log(`Chart saved as ${filename}`);
  }

  module.exports = {
    saveChartAsImage
};