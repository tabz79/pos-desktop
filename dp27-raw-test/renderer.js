const printButton = document.getElementById('print-button');

printButton.addEventListener('click', () => {
  const labelHtml = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { size: 50mm 25mm; margin: 0; }
          html, body {
            width: 50mm;
            height: 25mm;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
            font-family: Arial, sans-serif;
            font-size: 10pt;
            background: #eee;
            /* X locked, Y nudged slightly more upward */
            transform: translate(-9mm, -3mm);
          }
        </style>
      </head>
      <body>
        <div>
          <h1 style="margin:0;font-size:12pt;">TEST LABEL</h1>
          <p style="margin:0;">50x25mm shift test</p>
        </div>
      </body>
    </html>
  `;

  window.electron.printLabel(labelHtml);
});
