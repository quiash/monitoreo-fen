(() => {
  const button = document.getElementById('openAnaExport');
  const dialog = document.getElementById('anaExportDialog');
  const status = document.getElementById('anaExportCut');
  const files = document.getElementById('anaExportFiles');
  const directory = new URL('data/ana-export/', document.baseURI);

  button.addEventListener('click', async () => {
    dialog.showModal();
    files.hidden = true;
    status.textContent = 'Consultando el último corte acumulado…';

    try {
      const response = await fetch(new URL('latest.json', directory), { cache: 'no-cache' });
      if (!response.ok) throw new Error('Corte ANA no disponible');
      const { cut, digest, files: exports } = await response.json();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cut)) throw new Error('Corte ANA inválido');
      for (const link of files.querySelectorAll('[data-ana-file]')) {
        const filename = exports[link.dataset.anaFile];
        if (!/^ANA_[A-Za-z_]+\.(xlsx|png)$/.test(filename)) throw new Error('Archivo ANA inválido');
        const url = new URL(filename, directory);
        url.searchParams.set('v', digest);
        link.href = url;
        link.download = filename.replace(/\.(xlsx|png)$/, `_${cut}.$1`);
      }
      status.textContent = `Último avance acumulado · ${cut.split('-').reverse().join('/')}`;
      files.hidden = false;
    } catch {
      status.textContent = 'No se pudo consultar el corte ANA. Vuelve a abrir la exportación para reintentar.';
    }
  });
})();
