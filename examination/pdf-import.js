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

  async function brandQuestionPdf(file, subject) {
    if (!window.PDFLib?.PDFDocument) {
      throw new Error("The PDF branding library did not load. Refresh the page and try again.");
    }
    const cleanSubject = String(subject || "").trim();
    if (!cleanSubject) {
      throw new Error("This examination has no subject saved. Add its subject before uploading the PDF.");
    }

    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    if (!pdfDoc.getPageCount()) throw new Error("The selected PDF has no pages.");

    // Add a dedicated header band above page one instead of covering existing
    // content. This keeps every original question, diagram and option intact.
    const originalPage = pdfDoc.getPage(0);
    const originalSize = originalPage.getSize();
    const headerHeight = 82;
    const embeddedOriginal = await pdfDoc.embedPage(originalPage);
    const brandedPage = pdfDoc.insertPage(0, [
      originalSize.width,
      originalSize.height + headerHeight
    ]);
    brandedPage.drawPage(embeddedOriginal, { x: 0, y: 0, width: originalSize.width, height: originalSize.height });

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const heading = "SIR TAYYDAYO";
    const subjectHeading = cleanSubject.toLocaleUpperCase() + " TEST";
    const headingSize = Math.min(17, originalSize.width / 24);
    const subjectSize = Math.min(13, originalSize.width / 30);
    const centerText = (value, size, y) => {
      const width = font.widthOfTextAtSize(value, size);
      brandedPage.drawText(value, {
        x: Math.max(18, (originalSize.width - width) / 2),
        y,
        size,
        font,
        color: rgb(0.08, 0.08, 0.08)
      });
    };
    centerText(heading, headingSize, originalSize.height + 49);
    centerText(subjectHeading, subjectSize, originalSize.height + 25);

    const bytes = await pdfDoc.save();
    return new File([bytes], file.name, { type: "application/pdf", lastModified: Date.now() });
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
    button.textContent = "Branding and uploading PDF...";
    $("openOriginalPdf").hidden = true;
    status("Adding the CREST heading to page one without covering the original questions...", "info");

    try {
      const selectedOption = $("examSelect").selectedOptions?.[0];
      const subject = selectedOption?.dataset.subject || "";
      const brandedFile = await brandQuestionPdf(file, subject);
      if (brandedFile.size > MAX_BYTES) {
        throw new Error("The branded PDF is larger than 20 MB. Please choose a smaller source PDF.");
      }
      const client = E.getClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "question-paper.pdf";
      const path = `${currentUser.id}/${examId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await client.storage.from("crest-question-papers").upload(path, brandedFile, {
        contentType: "application/pdf", upsert: false
      });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const { error: recordError } = await client.from("examination_pdf_uploads").insert({
        examination_id: examId,
        created_by: currentUser.id,
        file_name: file.name,
        storage_path: path,
        file_size: brandedFile.size
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

      status("Branded PDF uploaded. Extracting selectable text in your browser...", "info");
      const text = await extractPdfText(brandedFile);
      $("extractedPdfText").value = text;
      if (!text || text.replace(/--- Page \d+ ---/g, "").trim().length < 20) {
        status("The PDF was safely uploaded, but little or no selectable text was found. It may be scanned. Use the Run OCR for scanned PDF button, then review the extracted text.", "warning");
      } else {
        status("PDF uploaded and text extracted. Review the text carefully, then transfer each question to the editor below.", "success");
      }
    } catch (error) {
      console.error("PDF question import:", error);
      status(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "Brand PDF, upload and extract text";
    }
  });


  let parsedQuestions = [];

  function parseQuestionPaper(raw) {
    const text = String(raw || "").replace(/\r/g, "").replace(/--- Page \d+ ---/g, "\n");
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    const starts = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(?:question\s*)?(\d{1,3})[.)、:-]\s*(.*)$/i);
      if (match && Number(match[1]) > 0) starts.push({ index, number: Number(match[1]), first: match[2] || "" });
    });
    const unique = starts.filter((item, index) => index === 0 || item.index !== starts[index - 1].index);
    return unique.map((start, index) => {
      const end = unique[index + 1]?.index ?? lines.length;
      const block = [start.first, ...lines.slice(start.index + 1, end)].filter(Boolean);
      const optionPattern = /^([A-H])[).:、-]\s*(.+)$/i;
      const optionStart = block.findIndex(line => optionPattern.test(line));
      const promptLines = optionStart < 0 ? block : block.slice(0, optionStart);
      const optionLines = optionStart < 0 ? [] : block.slice(optionStart);
      const options = optionLines.map(line => {
        const match = line.match(optionPattern);
        return match ? { label: match[1].toUpperCase(), text: match[2].trim() } : null;
      }).filter(Boolean);
      const questionText = promptLines.join(" ").replace(/\s+/g, " ").trim();
      if (!questionText) return null;
      const isTF = options.length === 2 &&
        options.map(o => o.text.toLowerCase()).sort().join("|") === "false|true";
      return {
        number: start.number,
        text: questionText,
        type: isTF ? "true_false" : options.length >= 2 ? "multiple_choice" : "short_answer",
        options: options.length >= 2 ? options : []
      };
    }).filter(Boolean);
  }

  function renderParsedQuestions() {
    const host = $("parsedQuestionPreview");
    const importButton = $("importParsedQuestions");
    if (!host || !importButton) return;
    if (!parsedQuestions.length) {
      host.innerHTML = "<p class='field-help'>No numbered questions were detected. Adjust the extracted text or use the question editor manually.</p>";
      importButton.hidden = true;
      return;
    }
    host.innerHTML = parsedQuestions.map((q, index) => {
      const optionsHtml = q.options.length
        ? "<p><strong>Options — select the correct answer</strong></p>" + q.options.map((o, oi) =>
            "<label class='parsed-option-row'><input type='radio' name='correct-" + index + "' value='" + oi + "'>" +
            "<input type='text' class='parsed-option-text' value='" + E.escape(o.text) + "' aria-label='Option " + o.label + "'></label>"
          ).join("")
        : "";
      return "<article class='parsed-question-card' data-parsed-index='" + index + "'>" +
        "<strong>Detected question " + (index + 1) + " (paper number " + q.number + ")</strong>" +
        "<small>Detected type: " + q.type.replaceAll("_", " ") + "</small>" +
        "<textarea class='parsed-question-text' rows='3'>" + E.escape(q.text) + "</textarea>" +
        optionsHtml +
        "<label>Marks <input class='parsed-question-marks' type='number' min='0.1' step='0.1' value='1'></label>" +
        "</article>";
    }).join("");
    importButton.hidden = false;
    importButton.textContent = "Import " + parsedQuestions.length + " reviewed question(s)";
  }

  $("parsePdfQuestions")?.addEventListener("click", () => {
    parsedQuestions = parseQuestionPaper($("extractedPdfText").value);
    renderParsedQuestions();
    status(parsedQuestions.length
      ? parsedQuestions.length + " question(s) detected. Review the wording and select the correct answer for each multiple-choice question."
      : "No numbered questions were detected. Check the extracted text format.", parsedQuestions.length ? "success" : "warning");
  });

  $("importParsedQuestions")?.addEventListener("click", async () => {
    const examId = selectedExamId();
    if (!examId || !parsedQuestions.length) return status("Select an examination and detect questions first.", "error");
    const cards = [...$("parsedQuestionPreview").querySelectorAll("[data-parsed-index]")];
    const prepared = cards.map((card, index) => {
      const q = parsedQuestions[index];
      const questionText = card.querySelector(".parsed-question-text").value.trim();
      const marks = Number(card.querySelector(".parsed-question-marks").value);
      const optionTexts = [...card.querySelectorAll(".parsed-option-text")].map(input => input.value.trim());
      const correct = card.querySelector("input[type=radio]:checked");
      const options = q.options.map((o, oi) => ({
        label: o.label, text: optionTexts[oi], is_correct: Boolean(correct && Number(correct.value) === oi)
      }));
      return { q, questionText, marks, options, hasCorrect: !q.options.length || Boolean(correct) };
    });
    const invalid = prepared.find(x => !x.questionText || !Number.isFinite(x.marks) || x.marks <= 0 || !x.hasCorrect || x.options.some(o => !o.text));
    if (invalid) return status("Complete every question, enter valid marks, and select one correct option for each multiple-choice question.", "error");

    const button = $("importParsedQuestions");
    button.disabled = true;
    let saved = 0;
    try {
      for (const item of prepared) {
        await E.rpc("crest_teacher_save_question", {
          p_question_id: null,
          p_exam_id: examId,
          p_question_text: item.questionText,
          p_question_type: item.q.type,
          p_marks: item.marks,
          p_question_number: item.q.number,
          p_options: item.options.map(o => ({ label: o.label, text: o.text, is_correct: o.is_correct })),
          p_correct_answer: null,
          p_image_url: null,
          p_is_required: true
        });
        saved += 1;
      }
      status(saved + " question(s) imported successfully. The question bank has been refreshed.", "success");
      if (typeof window.CREST_EXAM_REFRESH_QUESTIONS === "function") await window.CREST_EXAM_REFRESH_QUESTIONS();
      parsedQuestions = [];
      $("parsedQuestionPreview").innerHTML = "";
      button.hidden = true;
    } catch (error) {
      status(saved + " question(s) imported before an error: " + (error.message || error) + ". Check the question bank before retrying to avoid duplicates.", "error");
    } finally {
      button.disabled = false;
    }
  });

  async function runOcrOnPdf(file) {
    if (!window.pdfjsLib) throw new Error("The PDF reader did not load.");
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("OCR engine could not be loaded. Check your internet connection."));
        document.head.appendChild(script);
      });
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const results = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      status("OCR reading page " + pageNo + " of " + pdf.numPages + "...", "info");
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const result = await window.Tesseract.recognize(canvas, "eng");
      results.push("--- Page " + pageNo + " ---\n" + (result.data.text || ""));
      canvas.width = 0;
      canvas.height = 0;
    }
    return results.join("\n\n");
  }

  const ocrButton = document.createElement("button");
  ocrButton.type = "button";
  ocrButton.className = "secondary-btn";
  ocrButton.textContent = "Run OCR for scanned PDF";
  ocrButton.addEventListener("click", async () => {
    const file = $("questionPdf").files?.[0];
    if (!file) return status("Choose the scanned PDF first.", "error");
    ocrButton.disabled = true;
    try {
      const text = await runOcrOnPdf(file);
      $("extractedPdfText").value = text;
      status("OCR completed. Review the wording carefully, then detect questions and options.", "success");
    } catch (error) {
      status(error.message || String(error), "error");
    } finally {
      ocrButton.disabled = false;
    }
  });
  $("parsePdfQuestions")?.insertAdjacentElement("afterend", ocrButton);

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
