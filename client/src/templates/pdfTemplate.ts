export const getPdfTemplate = (filename: string, htmlContent: string) => `
<html>
  <head>
    <title>${filename}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Solway:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
      @page {
        size: A4;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        background-color: #f4e7d3;
        background-image: url('https://www.transparenttextures.com/patterns/parchment.png');
        background-repeat: repeat;
        -webkit-print-color-adjust: exact;
        color-adjust: exact;
      }
      .page {
        padding: 1in;
        font-family: 'Solway', serif;
        color: #1e1e1e;
        line-height: 1.6;
        min-height: 100vh;
      }
      h1 {
        font-family: 'Cinzel', serif;
        font-size: 3.5rem;
        font-weight: 900;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 4px solid #8e1111;
        text-transform: uppercase;
        color: #1e1e1e;
        page-break-after: avoid;
      }
      h2 {
        font-family: 'Cinzel', serif;
        font-size: 2rem;
        font-weight: 700;
        margin-top: 2rem;
        margin-bottom: 1rem;
        border-bottom: 2px solid rgba(142, 17, 17, 0.4);
        color: #1e1e1e;
        page-break-after: avoid;
      }
      h3 {
        font-family: 'Cinzel', serif;
        font-size: 1.5rem;
        font-weight: 700;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        color: #8e1111;
      }
      blockquote {
        background-color: rgba(224, 229, 193, 0.4);
        border-left: 10px solid #8e1111;
        padding: 1.5rem;
        margin: 1.5rem 0;
        font-style: italic;
        box-shadow: inset 0 0 10px rgba(0,0,0,0.05);
        page-break-inside: avoid;
      }
      p {
        margin-bottom: 1rem;
      }
      table {
        width: 100%;
        margin: 1.5rem 0;
        border-collapse: collapse;
        page-break-inside: avoid;
      }
      th {
        background-color: #8e1111;
        color: white;
        padding: 0.75rem;
        text-align: left;
        font-family: 'Cinzel', serif;
        text-transform: uppercase;
      }
      td {
        padding: 0.75rem;
        border-bottom: 1px solid rgba(142, 17, 17, 0.1);
      }
      hr {
        border: 0;
        border-top: 1px solid rgba(0,0,0,0.1);
        margin: 3em 0;
        page-break-after: always;
      }
      pre, code {
        background: rgba(0,0,0,0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <div class="page">${htmlContent}</div>
  </body>
</html>
`;
