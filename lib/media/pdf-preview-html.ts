/**
 * Local PDF.js HTML for Android WebView.
 * Android Chromium cannot render PDF bytes the way iOS WKWebView can, so we
 * paint pages onto a canvas. The file never leaves the device.
 */

export function sanitizePdfBase64(value: string): string {
  return value.replace(/[^A-Za-z0-9+/=]/g, '');
}

export function buildPdfPreviewHtml(base64: string): string {
  const safe = sanitizePdfBase64(base64);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4" />
  <style>
    html, body { margin: 0; padding: 0; background: #525659; }
    #pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px 0 24px; }
    canvas { width: 100%; max-width: 100%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
    #status { color: #e5e7eb; font: 14px sans-serif; text-align: center; padding: 24px; }
  </style>
</head>
<body>
  <div id="status">Preparing PDF preview…</div>
  <div id="pages"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    (function () {
      var status = document.getElementById('status');
      var pages = document.getElementById('pages');
      function fail(msg) {
        status.textContent = msg || 'Could not render this PDF';
      }
      try {
        if (!window.pdfjsLib) { fail('PDF renderer unavailable'); return; }
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var raw = atob('${safe}');
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
          status.style.display = 'none';
          var max = Math.min(pdf.numPages, 20);
          var chain = Promise.resolve();
          for (var n = 1; n <= max; n++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                  var base = page.getViewport({ scale: 1 });
                  var scale = Math.min(2.2, (window.innerWidth - 8) / base.width);
                  var viewport = page.getViewport({ scale: scale });
                  var canvas = document.createElement('canvas');
                  canvas.width = viewport.width;
                  canvas.height = viewport.height;
                  pages.appendChild(canvas);
                  return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                });
              });
            })(n);
          }
          return chain;
        }).catch(function () { fail('Could not render this PDF'); });
      } catch (e) { fail('Could not render this PDF'); }
    })();
  </script>
</body>
</html>`;
}
