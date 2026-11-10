/* CREST Examination — secure PDF upload and browser text extraction */
(() => {
  "use strict";
  const E = window.CREST_EXAM;
  const $ = id => document.getElementById(id);
  if (!E || !$ ("uploadExtractPdf")) return;

  const MAX_BYTES = 20 * 1024 * 1024;
  let currentUser = null;
  let uploadedPath = null;

  function status(message, type = "info") {
    E.message($("pdfImportStatus"), message, type);
  }

  function selectedExamId() {
    return $("examSelect")?.value || "";
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("The PDF reader did not load. Refresh the page and try again.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const lines = [];
      let lastY = null;
      for (const item of content.items) {
        if (!item.str) continue;
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) lines.push("\n");
        lines.push(item.str);
        if (item.hasEOL) lines.push("\n"); else lines.push(" ");
        if (y !== null) lastY = y;
      }
      pages.push(`--- Page ${pageNo} ---\n${lines.join("").replace(/[ \t]+\n/g, "\n").trim()}`);
    }
    return pages.join("\n\n").trim();
  }

  async function initialise() {
    try {
      const auth = await E.requireTeacher();
      currentUser = auth.user;
    } catch (error) {
      status(error.message || String(error), "error");
      $("uploadExtractPdf").disabled = true;
    }
  }

  $("uploadExtractPdf").addEventListener("click", async () => {
    const file = $("questionPdf").files?.[0];
    const examId = selectedExamId();
    if (!examId) return status("Select an examination first.", "error");
    if (!file) return status("Choose a PDF file first.", "error");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return status("Only PDF files are accepted.", "error");
    }
    if (file.size > MAX_BYTES) return status("The PDF is larger than 20 MB. Please choose a smaller file.", "error");
    if (!currentUser) return status("Your teacher session could not be verified. Sign in again.", "error");

    const button = $("uploadExtractPdf");
    button.disabled = true;
    button.textContent = "Uploading and reading PDF...";
    $("openOriginalPdf").hidden = true;
    status("Uploading the original PDF to the private CREST storage area...", "info");

    try {
      const client = E.getClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "question-paper.pdf";
      const path = `${currentUser.id}/${examId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await client.storage.from("crest-question-papers").upload(path, file, {
        contentType: "application/pdf", upsert: false
      });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const { error: recordError } = await client.from("examination_pdf_uploads").insert({
        examination_id: examId,
        created_by: currentUser.id,
        file_name: file.name,
        storage_path: path,
        file_size: file.size
      });
      if (recordError) {
        await client.storage.from("crest-question-papers").remove([path]);
        uploadedPath = null;
        throw recordError;
      }

      const { data: signed, error: signedError } = await client.storage
        .from("crest-question-papers").createSignedUrl(path, 60 * 60);
      if (!signedError && signed?.signedUrl) {
        $("openOriginalPdf").href = signed.signedUrl;
        $("openOriginalPdf").hidden = false;
      }

      status("Original PDF uploaded. Extracting selectable text in your browser...", "info");
      const text = await extractPdfText(file);
      $("extractedPdfText").value = text;
      if (!text || text.replace(/--- Page \d+ ---/g, "").trim().length < 20) {
        status("The PDF was safely uploaded, but little or no selectable text was found. It may be a scanned PDF. OCR is not included yet; please transcribe the questions into the editor.", "warning");
      } else {
        status("PDF uploaded and text extracted. Review the text carefully, then transfer each question to the editor below.", "success");
      }
    } catch (error) {
      console.error("PDF question import:", error);
      status(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "Upload and extract text";
    }
  });

  function transferText(useSelection) {
    const source = $("extractedPdfText");
    const chosen = useSelection && source.selectionStart !== source.selectionEnd
      ? source.value.slice(source.selectionStart, source.selectionEnd).trim()
      : source.value.trim();
    if (!chosen) return status("There is no extracted text to transfer. Select a PDF and upload it first.", "error");
    const questionBox = $("questionText");
    questionBox.value = chosen;
    questionBox.focus();
    questionBox.scrollIntoView({ behavior: "smooth", block: "center" });
    status("Text copied into the question editor. Review it, set the question type and marks, then save.", "success");
  }

  $("usePdfText").addEventListener("click", () => transferText(true));
  $("useAllPdfText").addEventListener("click", () => transferText(false));
  $("examSelect")?.addEventListener("change", () => {
    $("extractedPdfText").value = "";
    $("openOriginalPdf").hidden = true;
    uploadedPath = null;
    status("Select a PDF for the selected examination.", "info");
  });
  initialise();
})();
