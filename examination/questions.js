/* CREST Examination — question manager for the confirmed public.questions schema */
(() => {
  "use strict";
  const E = window.CREST_EXAM, $ = id => document.getElementById(id);
  if (!E || !$('questionForm')) return;
  const client = E.getClient(), form = $('questionForm'), examSelect = $('examSelect');
  const optionsSection = $('optionsSection'), optionsContainer = $('optionsContainer');
  const questionList = $('questionList'), saveButton = $('saveQuestion'), publishButton = $('publishExam');
  let currentExamId = null, savedQuestions = [], busy = false, saving = false;
  const esc = value => E.escape(value ?? '');
  const show = (text, type = 'info') => E.message($('pageMessage'), text, type);

  function rows() { return [...optionsContainer.querySelectorAll('.option-row')]; }
  function renumber() { rows().forEach((row, i) => { const label = String.fromCharCode(65 + i); row.dataset.label = label; row.querySelector('.option-label').textContent = `Option ${label}`; }); }
  function addOption(text = '', correct = false) {
    const row = document.createElement('div'); row.className = 'option-row';
    row.innerHTML = `<label class="correct-choice"><input type="radio" name="correctOption" class="correct-radio"><span class="option-label">Option</span><span class="correct-caption">Correct answer</span></label><input class="option-text" type="text" maxlength="1000" placeholder="Enter answer option" required><button type="button" class="remove-option" aria-label="Remove option">Remove</button>`;
    row.querySelector('.option-text').value = text; row.querySelector('.correct-radio').checked = Boolean(correct);
    row.querySelector('.remove-option').addEventListener('click', () => { row.remove(); renumber(); });
    optionsContainer.appendChild(row); renumber();
  }
  function resetOptions(type) {
    optionsContainer.replaceChildren();
    if (type === 'true_false') { addOption('True', true); addOption('False', false); }
    else if (type === 'multiple_choice') { addOption('', true); addOption(''); addOption(''); addOption(''); }
    updateTypeDisplay();
  }
  function updateTypeDisplay() {
    const type = $('questionType').value, needs = ['multiple_choice', 'true_false'].includes(type);
    optionsSection.hidden = !needs; $('addOption').hidden = type !== 'multiple_choice';
    optionsContainer.querySelectorAll('input').forEach(input => { input.disabled = !needs; input.required = needs && input.classList.contains('option-text'); });
    if (type === 'true_false') {
      const current = rows();
      if (current.length !== 2 || current[0].querySelector('.option-text').value.toLowerCase() !== 'true' || current[1].querySelector('.option-text').value.toLowerCase() !== 'false') resetOptions('true_false');
    } else if (type === 'multiple_choice' && rows().length < 2) resetOptions('multiple_choice');
  }
  function getOptions() { return rows().map(row => ({ label: row.dataset.label, text: row.querySelector('.option-text').value.trim(), is_correct: row.querySelector('.correct-radio').checked })); }
  function parseOptions(raw) {
    if (Array.isArray(raw)) return raw.map((o, i) => typeof o === 'string' ? { label: String.fromCharCode(65+i), text: o, is_correct: false } : ({ label: o.label || o.option_label || String.fromCharCode(65+i), text: o.text || o.option_text || '', is_correct: Boolean(o.is_correct || o.correct) }));
    if (typeof raw === 'string') { try { return parseOptions(JSON.parse(raw)); } catch (_) { return []; } }
    return [];
  }
  function clearForm() {
    form.reset(); $('questionId').value = ''; $('formHeading').textContent = 'Add a question';
    $('questionMarks').value = '1'; $('questionOrder').value = String(savedQuestions.length + 1);
    $('questionType').value = 'multiple_choice'; saveButton.textContent = 'Save question'; resetOptions('multiple_choice');
  }
  async function loadExaminations() {
    examSelect.disabled = true; examSelect.innerHTML = '<option value="">Loading examinations...</option>';
    try {
      await E.requireTeacher();
      const data = await E.rpc('crest_teacher_dashboard_exams') || [];
      examSelect.innerHTML = '<option value="">Choose an examination</option>';
      (data || []).forEach(exam => { const o = document.createElement('option'); o.value = exam.id; o.textContent = `${exam.title} — ${exam.subject || 'No subject'} (${exam.status || 'draft'})`; examSelect.appendChild(o); });
      const wanted = new URLSearchParams(location.search).get('exam');
      if (wanted && (data || []).some(x => x.id === wanted)) examSelect.value = wanted; else if ((data || []).length === 1) examSelect.value = data[0].id;
      if (examSelect.value) await loadQuestions(); else { questionList.textContent = 'Choose an examination to manage its questions.'; show('Select an examination to begin.', 'info'); }
    } catch (error) { show(error.message || String(error), 'error'); examSelect.innerHTML = '<option value="">Could not load examinations</option>'; }
    finally { examSelect.disabled = false; }
  }
  async function refreshTotal() { /* totals are recalculated securely by the database RPC */ }
  async function loadQuestions() {
    if (busy) return; currentExamId = examSelect.value;
    if (!currentExamId) { savedQuestions = []; $('questionCount').textContent = '0 questions'; questionList.textContent = 'Choose an examination.'; clearForm(); return; }
    busy = true; questionList.textContent = 'Loading questions...';
    try {
      const data = await E.rpc('crest_teacher_questions_list', { p_exam_id: currentExamId });
      savedQuestions = Array.isArray(data) ? data : []; renderQuestions(); clearForm();
      if (publishButton) { publishButton.disabled = false; publishButton.textContent = 'Publish examination'; }
      show(`${savedQuestions.length} question(s) loaded.`, 'success');
    } catch (error) { questionList.textContent = 'Questions could not be loaded.'; show(error.message || String(error), 'error'); }
    finally { busy = false; }
  }
  function renderQuestions() {
    $('questionCount').textContent = `${savedQuestions.length} question${savedQuestions.length === 1 ? '' : 's'}`;
    if (!savedQuestions.length) { questionList.innerHTML = '<div class="empty-state"><h3>No questions added yet</h3><p>Use the editor above or import text from a PDF.</p></div>'; return; }
    questionList.innerHTML = savedQuestions.map((q, i) => {
      const opts = parseOptions(q.options);
      const optionHtml = opts.length ? `<ol class="question-options">${opts.map(o => `<li class="${o.is_correct ? 'correct-option' : ''}"><strong>${esc(o.label)}.</strong> ${esc(o.text)} ${o.is_correct ? '<span class="correct-tag">Correct</span>' : ''}</li>`).join('')}</ol>` : '';
      const image = q.image_url && /^https?:\/\//i.test(q.image_url) ? `<img class="question-image" src="${esc(q.image_url)}" alt="Question illustration" loading="lazy">` : '';
      return `<article class="question-item"><div class="question-item-heading"><h3>Question ${esc(q.question_number || i + 1)}</h3><span class="marks-badge">${Number(q.marks || 0)} marks</span></div><p class="question-prompt">${esc(q.question_text)}</p><p class="question-meta">${esc(String(q.question_type || '').replaceAll('_', ' '))}</p>${optionHtml}${q.correct_answer ? `<p><strong>Expected answer / marking guide:</strong> ${esc(q.correct_answer)}</p>` : ''}${image}<div class="question-actions"><button type="button" data-edit="${esc(q.id)}">Edit question</button><button type="button" class="danger" data-delete="${esc(q.id)}">Delete question</button></div></article>`;
    }).join('');
    questionList.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editQuestion(b.dataset.edit)));
    questionList.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteQuestion(b.dataset.delete)));
  }
  function editQuestion(id) {
    const q = savedQuestions.find(x => x.id === id); if (!q) return;
    $('questionId').value = q.id; $('questionText').value = q.question_text || ''; $('questionType').value = q.question_type || 'multiple_choice';
    $('questionMarks').value = q.marks ?? 1; $('questionOrder').value = q.question_number ?? 1; $('correctAnswer').value = q.correct_answer || ''; $('imageUrl').value = q.image_url || '';
    $('formHeading').textContent = 'Edit question'; saveButton.textContent = 'Update question'; optionsContainer.replaceChildren();
    parseOptions(q.options).forEach(o => addOption(o.text, o.is_correct)); updateTypeDisplay(); $('questionEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveQuestion(event) {
    event.preventDefault(); if (saving) return; if (!currentExamId) return show('Select an examination first.', 'error');
    const type = $('questionType').value, needs = ['multiple_choice', 'true_false'].includes(type), options = needs ? getOptions() : [];
    if (needs && (options.length < 2 || options.some(o => !o.text) || options.filter(o => o.is_correct).length !== 1)) return show('Enter complete options and select exactly one correct answer.', 'error');
    if (type === 'true_false' && (options.length !== 2 || options[0].text.toLowerCase() !== 'true' || options[1].text.toLowerCase() !== 'false')) return show('True/False questions must use True and False options.', 'error');
    const marks = Number($('questionMarks').value), order = Number($('questionOrder').value), image = $('imageUrl').value.trim();
    if (!Number.isFinite(marks) || marks <= 0 || !Number.isInteger(order) || order < 1) return show('Enter valid marks and a whole-number question number.', 'error');
    if (image && !/^https?:\/\//i.test(image)) return show('The image URL must start with http:// or https://.', 'error');
    const payload = { examination_id: currentExamId, question_text: $('questionText').value.trim(), question_type: type, marks, options, correct_answer: $('correctAnswer').value.trim() || null, question_number: order, image_url: image || null, is_required: true };
    if (!payload.question_text) return show('Enter the question text.', 'error');
    saving = true; saveButton.disabled = true; saveButton.textContent = 'Saving...'; show('Saving question...', 'info');
    try {
      await E.rpc('crest_teacher_save_question', {
        p_question_id: $('questionId').value || null,
        p_exam_id: currentExamId,
        p_question_text: payload.question_text,
        p_question_type: payload.question_type,
        p_marks: payload.marks,
        p_question_number: payload.question_number,
        p_options: payload.options,
        p_correct_answer: payload.correct_answer,
        p_image_url: payload.image_url,
        p_is_required: payload.is_required
      });
      await loadQuestions(); show('Question saved successfully.', 'success');
    } catch (error) { show(error.message || String(error), 'error'); }
    finally { saving = false; saveButton.disabled = false; saveButton.textContent = $('questionId').value ? 'Update question' : 'Save question'; }
  }
  async function deleteQuestion(id) {
    if (!confirm('Delete this question? This cannot be undone.')) return;
    try { await E.rpc('crest_teacher_delete_question', { p_question_id: id, p_exam_id: currentExamId }); await loadQuestions(); show('Question deleted.', 'success'); }
    catch (error) { show(error.message || String(error), 'error'); }
  }
  async function publishExam() {
    if (!currentExamId) return show('Select an examination first.', 'error');
    if (!savedQuestions.length) return show('Add at least one question before publishing.', 'error');
    if (!confirm('Publish this examination? Students may be able to access it according to its schedule and access settings.')) return;
    publishButton.disabled = true;
    try { await E.rpc('crest_teacher_publish_exam_master2', { p_exam_id: currentExamId }); show('Examination published successfully.', 'success'); await loadExaminations(); }
    catch (error) { show(error.message || String(error), 'error'); publishButton.disabled = false; }
  }
  $('questionType').addEventListener('change', () => { const type = $('questionType').value; resetOptions(type); });
  $('addOption').addEventListener('click', () => addOption());
  $('cancelEdit').addEventListener('click', clearForm);
  $('refreshQuestions').addEventListener('click', loadQuestions);
  examSelect.addEventListener('change', loadQuestions);
  form.addEventListener('submit', saveQuestion);
  publishButton?.addEventListener('click', publishExam);
  loadExaminations();
})();
