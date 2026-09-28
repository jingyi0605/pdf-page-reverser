import { PDFDocument } from 'pdf-lib';

(() => {
  'use strict';

  const MAX_FILE_SIZE = 100 * 1024 * 1024;
  const state = { file: null, sourceBytes: null, outputUrl: null };

  const elements = {
    fileInput: document.querySelector('#file-input'),
    dropZone: document.querySelector('#drop-zone'),
    pasteButton: document.querySelector('#paste-button'),
    selectedFile: document.querySelector('#selected-file'),
    fileName: document.querySelector('#file-name'),
    fileMeta: document.querySelector('#file-meta'),
    removeFile: document.querySelector('#remove-file'),
    reverseButton: document.querySelector('#reverse-button'),
    statusMessage: document.querySelector('#status-message'),
    stats: document.querySelector('#stats'),
    pageCount: document.querySelector('#page-count'),
    duplexPrint: document.querySelector('#duplex-print'),
    downloadArea: document.querySelector('#download-area'),
    downloadLink: document.querySelector('#download-link'),
    printButton: document.querySelector('#print-button'),
    printNote: document.querySelector('#print-note'),
    downloadMeta: document.querySelector('#download-meta'),
    toast: document.querySelector('#toast')
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const setStatus = (message, type = '') => {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message${type ? ` is-${type}` : ''}`;
  };

  const showToast = (message) => {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
  };

  const resetOutput = () => {
    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = null;
    elements.downloadArea.hidden = true;
    elements.downloadLink.removeAttribute('href');
    elements.printNote.textContent = '';
    elements.downloadMeta.textContent = '';
  };

  const clearFile = () => {
    state.file = null;
    state.sourceBytes = null;
    elements.fileInput.value = '';
    elements.selectedFile.hidden = true;
    elements.stats.hidden = true;
    elements.reverseButton.disabled = true;
    resetOutput();
    setStatus('添加一个 PDF 后即可开始');
  };

  const loadFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('请选择 PDF 文件');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast('文件过大，请选择 100 MB 以内的 PDF');
      return;
    }

    resetOutput();
    setStatus('正在读取 PDF 页面…');
    elements.reverseButton.disabled = true;
    try {
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      state.file = file;
      state.sourceBytes = bytes;
      elements.fileName.textContent = file.name;
      elements.fileMeta.textContent = `${formatBytes(file.size)} · ${pdf.getPageCount()} 页`;
      elements.pageCount.textContent = pdf.getPageCount();
      elements.selectedFile.hidden = false;
      elements.stats.hidden = false;
      elements.reverseButton.disabled = false;
      setStatus('文件已准备好，可以开始反转', 'success');
    } catch (error) {
      console.error(error);
      clearFile();
      setStatus('无法读取这个 PDF，请确认文件未损坏或加密', 'error');
    }
  };

  const reversePdf = async () => {
    if (!state.sourceBytes) return;
    elements.reverseButton.disabled = true;
    setStatus('正在重新排列页面，请稍候…');
    resetOutput();
    try {
      const source = await PDFDocument.load(state.sourceBytes);
      const output = await PDFDocument.create();
      const sourcePageCount = source.getPageCount();
      const duplexPrintEnabled = elements.duplexPrint.checked;
      const shouldAddBlankPage = duplexPrintEnabled && sourcePageCount % 2 === 1;
      const indices = Array.from({ length: sourcePageCount }, (_, index) => sourcePageCount - 1 - index);
      const pages = await output.copyPages(source, indices);

      // 双面打印按两页组成一张纸；奇数页时先补一张同尺寸空白页，避免正反面错位。
      if (shouldAddBlankPage) {
        const firstPrintedPage = source.getPage(sourcePageCount - 1);
        const { width, height } = firstPrintedPage.getSize();
        output.addPage([width, height]);
      }
      pages.forEach((page) => output.addPage(page));
      const bytes = await output.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      state.outputUrl = URL.createObjectURL(blob);
      const baseName = state.file.name.replace(/\.pdf$/i, '');
      elements.downloadLink.href = state.outputUrl;
      elements.downloadLink.download = `${baseName}-倒序版.pdf`;
      elements.downloadMeta.textContent = `${formatBytes(blob.size)} · ${sourcePageCount + (shouldAddBlankPage ? 1 : 0)} 页输出`;
      elements.printNote.textContent = shouldAddBlankPage
        ? '奇数页已在首页补 1 张空白页，适配双面打印。装订时请在打印对话框选择长边翻转（书籍）或短边翻转（台历）。'
        : duplexPrintEnabled
          ? '已启用双面打印，当前页数为偶数，无需补空白页。装订方向请在打印对话框选择长边翻转（书籍）或短边翻转（台历）。'
          : '未启用双面打印，本次仅倒序页面，不补空白页。';
      elements.downloadArea.hidden = false;
      setStatus('页面已倒序排列，文件可以下载了', 'success');
    } catch (error) {
      console.error(error);
      setStatus('处理失败，请换一个 PDF 重试', 'error');
    } finally {
      elements.reverseButton.disabled = false;
    }
  };

  const printPdf = () => {
    if (!state.outputUrl) return;

    // 直接打开 PDF Blob，让浏览器的 PDF 打印管线处理真实 PDF 文件。
    const printWindow = window.open(state.outputUrl, '_blank');
    if (!printWindow) {
      showToast('浏览器阻止了打印窗口，请允许弹出窗口后重试');
      return;
    }

    let printTriggered = false;
    const triggerPrint = () => {
      if (printTriggered || printWindow.closed) return;
      printTriggered = true;
      printWindow.focus();
      if (typeof printWindow.print === 'function') printWindow.print();
    };

    // 不同浏览器对内置 PDF 查看器的 load 事件支持不同，双保险触发一次打印。
    printWindow.addEventListener('load', triggerPrint, { once: true });
    window.setTimeout(triggerPrint, 1100);
  };

  elements.fileInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
  elements.removeFile.addEventListener('click', clearFile);
  elements.reverseButton.addEventListener('click', reversePdf);
  elements.printButton.addEventListener('click', printPdf);
  elements.pasteButton.addEventListener('click', async () => {
    try {
      const clipboard = await navigator.clipboard.read();
      for (const item of clipboard) {
        const pdfType = item.types.find((type) => type === 'application/pdf');
        if (pdfType) {
          const blob = await item.getType(pdfType);
          await loadFile(new File([blob], '粘贴的 PDF.pdf', { type: 'application/pdf' }));
          return;
        }
      }
      showToast('剪贴板中没有 PDF 文件');
    } catch (error) {
      showToast('浏览器未授予剪贴板读取权限，请直接按 Ctrl/⌘ V');
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('is-dragging');
    });
  });
  elements.dropZone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      elements.fileInput.click();
    }
  });

  document.addEventListener('paste', (event) => {
    const file = Array.from(event.clipboardData?.files || []).find((item) => item.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf'));
    if (file) {
      event.preventDefault();
      loadFile(file);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  });
})();
