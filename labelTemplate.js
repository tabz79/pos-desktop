function getLabelHtml(title, subtitle, barcode) {
  return `
    <html>
      <head>
        <style>
          @page {
            size: 50mm 25mm;
            margin: 0;
          }
          html, body {
            width: 50mm;
            height: 25mm;
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
            overflow: hidden;
          }
          .label-container {
            transform: translate(-9mm, -3mm);
            width: 100%;
          }
          h1 {
            font-size: 12pt;
            margin: 0;
            font-weight: bold;
          }
          p {
            font-size: 9pt;
            margin: 0;
          }
          img {
            display: block;
            margin: 2mm auto 0;
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          <h1>${title}</h1>
          <p>${subtitle}</p>
          ${barcode ? `<img src="${barcode}">` : ''}
        </div>
      </body>
    </html>
  `;
}

module.exports = { getLabelHtml };
