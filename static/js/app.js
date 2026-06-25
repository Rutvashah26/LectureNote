// ════════════════════════════════════════════════════════
// app.js — LectureNote frontend logic
// Talks to the Flask backend in /backend (see API_BASE below).
// ════════════════════════════════════════════════════════

// ─── CONFIG ───
const API_BASE = 'http://localhost:5000/api';

// ─── STATE ───
let currentUser = null;       // set after /auth/me succeeds
let lectures = [];
let activeLectureId = null;
let activeLecture = null;
let activeTab = 'summary';
let inputTab = 'record';
let sourceKind = 'audio';     // 'audio' | 'video' — for the Upload tab toggle
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let recordingBlob = null;
let selectedFile = null;
let quizAnswers = {};
let quizRevealed = {};
let deletePendingId = null;

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  setupGenOptions();
  checkAuth();
});

function setupGenOptions() {
  document.querySelectorAll('.gen-option').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('selected'));
  });
}

// ════════════════════════════════════════════════════════
// AUTH (Google OAuth via backend session cookie)
// ════════════════════════════════════════════════════════

async function checkAuth() {
  try {
    const user = await apiGet('/auth/me');
    currentUser = user;
    renderAuthUI();
    showApp();
    await loadLectures();
  } catch (e) {
    currentUser = null;
    renderAuthUI();
    showLoginGate();
  }
}

function renderAuthUI() {
  const area = document.getElementById('authArea');
  if (!area) return;

  if (currentUser) {
    const initials = (currentUser.name || currentUser.email).slice(0, 1).toUpperCase();
    area.innerHTML = `
      <div class="user-menu">
        <button class="user-chip" onclick="toggleUserDropdown()">
          ${currentUser.picture
            ? `<img src="${escHtml(currentUser.picture)}" alt="" />`
            : `<span class="avatar-fallback">${initials}</span>`}
          <span class="user-chip-name">${escHtml(currentUser.name || currentUser.email)}</span>
        </button>
        <div class="user-dropdown" id="userDropdown">
          <div class="user-dropdown-email">${escHtml(currentUser.email)}</div>
          <button class="user-dropdown-item danger" onclick="logout()">↪ Log out</button>
        </div>
      </div>
    `;
  } else {
    area.innerHTML = `
      <button class="google-login-btn" onclick="loginWithGoogle()">
        <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="" />
        Sign in with Google
      </button>
    `;
  }
}

function toggleUserDropdown() {
  document.getElementById('userDropdown')?.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const menu = document.querySelector('.user-menu');
  if (menu && !menu.contains(e.target)) {
    document.getElementById('userDropdown')?.classList.remove('open');
  }
});

function loginWithGoogle() {
  // Full page redirect to Flask, which redirects to Google, which redirects back.
  window.location.href = API_BASE + '/auth/google/login';
}

async function logout() {
  try {
    await apiPost('/auth/logout', {});
  } catch (e) { /* ignore */ }
  currentUser = null;
  lectures = [];
  renderAuthUI();
  showLoginGate();
  showToast('Logged out.', 'success');
}

function showApp() {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('appShell').style.display = 'grid';
}

function showLoginGate() {
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginGate').style.display = 'flex';
}

// ════════════════════════════════════════════════════════
// API HELPERS  (credentials:'include' sends the session cookie)
// ════════════════════════════════════════════════════════

async function apiGet(path) {
  let r;
  try {
    r = await fetch(API_BASE + path, { credentials: 'include' });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Is the Flask backend running on http://localhost:5000?');
  }
  if (!r.ok) throw new Error((await safeJson(r)).error || 'Request failed');
  return r.json();
}

async function apiPost(path, body) {
  let r;
  try {
    r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Is the Flask backend running on http://localhost:5000?');
  }
  if (!r.ok) throw new Error((await safeJson(r)).error || 'Request failed');
  return r.json();
}

async function apiPostForm(path, formData) {
  let r;
  try {
    r = await fetch(API_BASE + path, { method: 'POST', credentials: 'include', body: formData });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Is the Flask backend running on http://localhost:5000?');
  }
  if (!r.ok) throw new Error((await safeJson(r)).error || 'Request failed');
  return r.json();
}

async function apiDelete(path) {
  let r;
  try {
    r = await fetch(API_BASE + path, { method: 'DELETE', credentials: 'include' });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Is the Flask backend running on http://localhost:5000?');
  }
  if (!r.ok) throw new Error((await safeJson(r)).error || 'Request failed');
  return r.json();
}

async function safeJson(r) {
  try { return await r.json(); } catch { return {}; }
}

// ════════════════════════════════════════════════════════
// LECTURES / HISTORY
// ════════════════════════════════════════════════════════

async function loadLectures() {
  try {
    lectures = await apiGet('/lectures');
    renderSidebar();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderSidebar() {
  const list = document.getElementById('lectureList');
  if (!lectures.length) {
    list.innerHTML = '<div style="padding:16px 8px;font-size:0.85rem;color:var(--ink-muted);">No lectures yet. Create your first one.</div>';
    return;
  }
  list.innerHTML = lectures.map(l => `
    <div class="lecture-item ${l.id === activeLectureId ? 'active' : ''}" onclick="openLecture('${l.id}')">
      <div class="lecture-item-title">${escHtml(l.title)}</div>
      <div class="lecture-item-meta">
        <span class="status-dot ${l.status}"></span>
        <span class="lecture-item-subject">${l.subject ? escHtml(l.subject) : l.status}</span>
      </div>
    </div>
  `).join('');
}

// ─── OPEN LECTURE ───
async function openLecture(id) {
  activeLectureId = id;
  renderSidebar();
  document.getElementById('welcomeView').style.display = 'none';
  document.getElementById('lectureViewContainer').style.display = 'block';

  const container = document.getElementById('lectureViewContainer');
  container.innerHTML = `<div class="processing-view"><div class="spinner"></div><p>Loading lecture…</p></div>`;

  try {
    activeLecture = await apiGet(`/lectures/${id}`);
    renderLectureView(activeLecture);
  } catch (e) {
    container.innerHTML = `<div class="processing-view"><p>${escHtml(e.message)}</p></div>`;
  }
}

function renderLectureView(lecture) {
  const container = document.getElementById('lectureViewContainer');
  const notes = lecture.notes || [];

  const summaryNote = notes.find(n => n.type === 'summary');
  const outlineNote = notes.find(n => n.type === 'outline');
  const flashNote = notes.find(n => n.type === 'flashcards');
  const quizNote = notes.find(n => n.type === 'quiz');

  container.innerHTML = `
    <div class="lecture-view">
      <div class="lecture-header">
        <div class="lecture-breadcrumb">Lectures / ${escHtml(lecture.title)}</div>
        <div class="lecture-header-top">
          <div>
            <h1 class="lecture-title-display">${escHtml(lecture.title)}</h1>
            <div class="lecture-meta-badges">
              ${lecture.subject ? `<span class="badge badge-subject">📚 ${escHtml(lecture.subject)}</span>` : ''}
              <span class="badge badge-status-${lecture.status}">${statusLabel(lecture.status)}</span>
              <span class="badge badge-subject">📅 ${formatDate(lecture.created_at)}</span>
              ${lecture.source_type ? `<span class="badge badge-subject">${lecture.source_type === 'video' ? '🎬' : lecture.source_type === 'audio' ? '🎙️' : '📝'} ${lecture.source_type}</span>` : ''}
            </div>
          </div>
          <div class="lecture-actions">
            <button class="btn-icon" title="Export notes" onclick="exportNotes()">⬇️</button>
            <button class="btn-icon danger" title="Delete lecture" onclick="confirmDelete('${lecture.id}')">🗑️</button>
          </div>
        </div>
      </div>

      ${lecture.status === 'processing' ? `
        <div class="processing-view">
          <div class="spinner"></div>
          <p>Generating your study materials…</p>
        </div>
      ` : lecture.status === 'failed' ? `
        <div class="processing-view">
          <p>⚠️ Generation failed: ${escHtml(lecture.error || 'Unknown error')}</p>
        </div>
      ` : `
        <div class="content-tabs">
          ${summaryNote ? `<button class="content-tab ${activeTab==='summary'?'active':''}" onclick="switchTab('summary')">📋 Summary</button>` : ''}
          ${outlineNote ? `<button class="content-tab ${activeTab==='outline'?'active':''}" onclick="switchTab('outline')">🗂️ Outline</button>` : ''}
          ${flashNote ? `<button class="content-tab ${activeTab==='flashcards'?'active':''}" onclick="switchTab('flashcards')"><span>🃏 Flashcards</span>${flashNote.flashcards ? `<span class="tab-count">${flashNote.flashcards.length}</span>` : ''}</button>` : ''}
          ${quizNote ? `<button class="content-tab ${activeTab==='quiz'?'active':''}" onclick="switchTab('quiz')"><span>✅ Quiz</span>${quizNote.questions ? `<span class="tab-count">${quizNote.questions.length}</span>` : ''}</button>` : ''}
          ${lecture.transcript ? `<button class="content-tab ${activeTab==='transcript'?'active':''}" onclick="switchTab('transcript')">📄 Transcript</button>` : ''}
        </div>

        <div id="tabSummary" class="tab-panel ${activeTab==='summary'?'active':''}">
          ${summaryNote ? renderSummary(summaryNote) : '<div class="empty-note">📋<p>No summary was generated.</p></div>'}
        </div>
        <div id="tabOutline" class="tab-panel ${activeTab==='outline'?'active':''}">
          ${outlineNote ? renderOutline(outlineNote) : '<div class="empty-note">🗂️<p>No outline was generated.</p></div>'}
        </div>
        <div id="tabFlashcards" class="tab-panel ${activeTab==='flashcards'?'active':''}">
          ${flashNote ? renderFlashcards(flashNote) : '<div class="empty-note">🃏<p>No flashcards were generated.</p></div>'}
        </div>
        <div id="tabQuiz" class="tab-panel ${activeTab==='quiz'?'active':''}">
          ${quizNote ? renderQuiz(quizNote) : '<div class="empty-note">✅<p>No quiz were generated.</p></div>'}
        </div>
        <div id="tabTranscript" class="tab-panel ${activeTab==='transcript'?'active':''}">
          ${lecture.transcript
            ? `<div class="transcript-box">${escHtml(lecture.transcript)}</div>`
            : `<div class="transcript-empty">No transcript available.</div>`}
        </div>
      `}
    </div>
  `;

  quizAnswers = {};
  quizRevealed = {};
}

function renderSummary(note) {
  return `
    <div class="export-bar">
      <button class="export-btn" onclick="copyToClipboard(${JSON.stringify(note.content)})">📋 Copy</button>
      <button class="export-btn" onclick="downloadText(${JSON.stringify(note.content)}, 'summary.md')">⬇️ Download .md</button>
    </div>
    <div class="summary-content">${simpleMarkdown(note.content)}</div>
  `;
}

function renderOutline(note) {
  return `
    <div class="export-bar">
      <button class="export-btn" onclick="copyToClipboard(${JSON.stringify(note.content)})">📋 Copy</button>
      <button class="export-btn" onclick="downloadText(${JSON.stringify(note.content)}, 'outline.md')">⬇️ Download .md</button>
    </div>
    <div class="outline-content">${simpleMarkdown(note.content)}</div>
  `;
}

function renderFlashcards(note) {
  const cards = note.flashcards || [];
  if (!cards.length) return '<div class="empty-note">No flashcards found.</div>';
  return `
    <div style="margin-bottom:16px;font-size:0.88rem;color:var(--ink-muted);">Tap a card to reveal the answer. ${cards.length} cards total.</div>
    <div class="flashcards-grid">
      ${cards.map((c, i) => `
        <div class="flashcard" id="fc-${i}" onclick="flipCard(${i})">
          <div class="flashcard-inner">
            <div class="flashcard-face flashcard-front">
              <div class="flashcard-label">Question</div>
              <div class="flashcard-text">${escHtml(c.front)}</div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div class="flashcard-label" style="color:rgba(255,255,255,0.6)">Answer</div>
              <div class="flashcard-text">${escHtml(c.back)}</div>
              <div class="flashcard-hint">Tap again to flip back</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderQuiz(note) {
  const questions = note.questions || [];
  if (!questions.length) return '<div class="empty-note">No quiz questions found.</div>';

  return `
    <div class="quiz-progress-bar"><div class="quiz-progress-fill" id="quizProgressFill" style="width:0%"></div></div>
    <div id="quizScorePanel" style="display:none;" class="quiz-score-panel">
      <div class="quiz-score-num" id="quizScoreNum">0/${questions.length}</div>
      <div class="quiz-score-label">Questions answered correctly</div>
      <button class="quiz-retry-btn" onclick="retryQuiz()">Try again</button>
    </div>
    <div class="quiz-container">
      ${questions.map((q, i) => `
        <div class="quiz-card" id="qcard-${i}">
          <div class="quiz-q-num">Question ${i+1} of ${questions.length}</div>
          <div class="quiz-question">${escHtml(q.question)}</div>
          <div class="quiz-options">
            ${['a','b','c','d'].map(letter => `
              <div class="quiz-option" id="qopt-${i}-${letter}" onclick="answerQuiz(${i}, '${letter}', '${q.correct_answer}')">
                <div class="option-letter">${letter}</div>
                <span>${escHtml(q[`option_${letter}`])}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── TAB SWITCHING ───
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById(`tab${capitalize(tab)}`);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.content-tab').forEach(t => {
    if (t.textContent.toLowerCase().includes(tab === 'flashcards' ? 'flash' : tab)) t.classList.add('active');
  });
}

// ─── QUIZ LOGIC ───
function answerQuiz(qIndex, selected, correct) {
  if (quizRevealed[qIndex]) return;
  quizRevealed[qIndex] = true;
  quizAnswers[qIndex] = selected;

  ['a','b','c','d'].forEach(letter => {
    const el = document.getElementById(`qopt-${qIndex}-${letter}`);
    el.classList.add('revealed');
    if (letter === correct) el.classList.add('correct');
    else if (letter === selected) el.classList.add('incorrect');
    else el.classList.add('not-selected');
  });

  const total = activeLecture?.notes?.find(n=>n.type==='quiz')?.questions?.length || 0;
  const answered = Object.keys(quizRevealed).length;
  const correct_count = Object.entries(quizAnswers).filter(([k,v]) => {
    const q = activeLecture?.notes?.find(n=>n.type==='quiz')?.questions?.[parseInt(k)];
    return q && v === q.correct_answer;
  }).length;

  const fill = document.getElementById('quizProgressFill');
  if (fill) fill.style.width = `${(answered/total)*100}%`;

  if (answered === total) {
    const panel = document.getElementById('quizScorePanel');
    const num = document.getElementById('quizScoreNum');
    if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior: 'smooth' }); }
    if (num) num.textContent = `${correct_count}/${total}`;
  }
}

function retryQuiz() {
  quizAnswers = {};
  quizRevealed = {};
  renderLectureView(activeLecture);
  switchTab('quiz');
}

function flipCard(i) {
  document.getElementById(`fc-${i}`)?.classList.toggle('flipped');
}

// ════════════════════════════════════════════════════════
// MICROPHONE PERMISSION + RECORDING
// ════════════════════════════════════════════════════════

let micPermissionState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'prompt'

async function checkMicPermission() {
  if (navigator.permissions) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      micPermissionState = status.state;
      renderMicBanner();
      status.onchange = () => { micPermissionState = status.state; renderMicBanner(); };
    } catch {
      micPermissionState = 'unknown';
    }
  }
}

function renderMicBanner() {
  const el = document.getElementById('micBanner');
  if (!el) return;
  if (micPermissionState === 'denied') {
    el.className = 'mic-permission-banner denied';
    el.innerHTML = `<span class="icon">🚫</span><span>Microphone access is blocked. Enable it in your browser's site settings to record.</span>`;
    el.style.display = 'flex';
  } else if (micPermissionState === 'granted') {
    el.style.display = 'none';
  } else {
    el.className = 'mic-permission-banner';
    el.innerHTML = `<span class="icon">🎙️</span><span>We'll ask for microphone permission when you tap record.</span>`;
    el.style.display = 'flex';
  }
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    // This call itself triggers the browser's native permission prompt
    // the first time, or fails immediately if previously denied.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micPermissionState = 'granted';
    renderMicBanner();

    recordingChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data); };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start();

    recordingSeconds = 0;
    document.getElementById('recorderArea').classList.add('recording');
    document.getElementById('recordBtn').textContent = '⏹️';
    document.getElementById('recordStatus').textContent = 'Recording… tap to stop';
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      document.getElementById('recordTimer').textContent = formatTime(recordingSeconds);
    }, 1000);

  } catch (err) {
    micPermissionState = 'denied';
    renderMicBanner();
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showToast('Microphone permission was denied. Allow access in your browser settings to record.', 'error');
    } else if (err.name === 'NotFoundError') {
      showToast('No microphone was found on this device.', 'error');
    } else {
      showToast('Could not start recording: ' + err.message, 'error');
    }
  }
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  clearInterval(recordingTimer);
  document.getElementById('recorderArea').classList.remove('recording');
  document.getElementById('recordBtn').textContent = '🎙️';
}

function handleRecordingStop() {
  recordingBlob = new Blob(recordingChunks, { type: 'audio/webm' });
  document.getElementById('recordStatus').textContent = 'Recording captured — review below or re-record.';
  document.getElementById('recordingTranscriptPreview').style.display = 'block';
  showToast('Recording saved. Transcription happens automatically on submit, or paste/edit text below.', 'info');
}

// ════════════════════════════════════════════════════════
// FILE HANDLING — supports AUDIO and VIDEO uploads
// ════════════════════════════════════════════════════════

function setUploadSourceKind(kind) {
  sourceKind = kind;
  document.getElementById('uploadTypeAudioBtn').classList.toggle('active', kind === 'audio');
  document.getElementById('uploadTypeVideoBtn').classList.toggle('active', kind === 'video');
  const input = document.getElementById('audioFileInput');
  input.accept = kind === 'video'
    ? '.mp4,.mov,.avi,.mkv,.webm'
    : '.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac';
  document.querySelector('#fileDrop .file-drop-text').innerHTML = kind === 'video'
    ? '<strong>Click to upload</strong> or drag & drop<br>MP4, MOV, AVI, MKV — up to 200MB'
    : '<strong>Click to upload</strong> or drag & drop<br>MP3, WAV, M4A, OGG — up to 200MB';
  document.querySelector('#fileDrop .file-drop-icon').textContent = kind === 'video' ? '🎬' : '🎵';
  document.getElementById('fileSelectedIcon').textContent = kind === 'video' ? '🎬' : '🎵';
  clearFile();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) setSelectedFile(file);
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('fileDrop').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('fileDrop').classList.remove('drag-over');
}

function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('fileDrop').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
}

function setSelectedFile(file) {
  selectedFile = file;
  document.getElementById('fileSelectedInfo').style.display = 'flex';
  document.getElementById('fileSelectedName').textContent = file.name;
}

function clearFile() {
  selectedFile = null;
  document.getElementById('fileSelectedInfo').style.display = 'none';
  document.getElementById('audioFileInput').value = '';
}

// ─── INPUT TAB SWITCH ───
function switchInputTab(tab) {
  inputTab = tab;
  ['record', 'upload', 'text'].forEach(t => {
    document.getElementById(`tab${capitalize(t)}`).classList.toggle('active', t === tab);
    document.getElementById(`panel${capitalize(t)}`).style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'record') checkMicPermission();
}

// ════════════════════════════════════════════════════════
// SUBMIT LECTURE — routes to text endpoint or file endpoint
// ════════════════════════════════════════════════════════

async function submitLecture() {
  const title = document.getElementById('lectureTitle').value.trim();
  const subject = document.getElementById('lectureSubject').value.trim();

  if (!title) { showToast('Please enter a lecture title.', 'error'); return; }

  const selectedTypes = [...document.querySelectorAll('.gen-option.selected')].map(el => el.dataset.type);
  if (!selectedTypes.length) { showToast('Select at least one output type.', 'error'); return; }

  const btn = document.getElementById('submitBtn');
  const btnText = document.getElementById('submitBtnText');
  btn.disabled = true;

  try {
    let result;

    if (inputTab === 'text') {
      const transcript = document.getElementById('pasteText').value.trim();
      if (!transcript || transcript.length < 20) {
        throw new Error('Please paste at least 20 characters of text.');
      }
      btnText.textContent = 'Generating…';
      result = await apiPost('/transcribe/process/text', { title, subject, transcript, generateTypes: selectedTypes });

    } else if (inputTab === 'record') {
      const editedText = document.getElementById('recordingTranscriptText').value.trim();
      if (editedText.length >= 20) {
        // User reviewed/typed a transcript manually — skip server-side transcription.
        btnText.textContent = 'Generating…';
        result = await apiPost('/transcribe/process/text', { title, subject, transcript: editedText, generateTypes: selectedTypes });
      } else if (recordingBlob) {
        btnText.textContent = 'Transcribing…';
        const formData = new FormData();
        formData.append('title', title);
        formData.append('subject', subject);
        formData.append('generateTypes', JSON.stringify(selectedTypes));
        formData.append('file', recordingBlob, 'recording.webm');
        result = await apiPostForm('/transcribe/process/file', formData);
      } else {
        throw new Error('Record some audio first, or type a transcript.');
      }

    } else if (inputTab === 'upload') {
      const pastedText = document.getElementById('uploadTranscriptText').value.trim();
      if (pastedText.length >= 20) {
        btnText.textContent = 'Generating…';
        result = await apiPost('/transcribe/process/text', { title, subject, transcript: pastedText, generateTypes: selectedTypes });
      } else if (selectedFile) {
        btnText.textContent = sourceKind === 'video' ? 'Extracting audio & transcribing…' : 'Transcribing…';
        const formData = new FormData();
        formData.append('title', title);
        formData.append('subject', subject);
        formData.append('generateTypes', JSON.stringify(selectedTypes));
        formData.append('file', selectedFile);
        result = await apiPostForm('/transcribe/process/file', formData);
      } else {
        throw new Error('Upload an audio/video file, or paste a transcript.');
      }
    }

    closeNewLectureModal();
    showToast('Study materials generated!', 'success');
    await loadLectures();
    await openLecture(result.lectureId);

  } catch (e) {
    showToast(e.message || 'Failed to generate. Is the backend running?', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Generate Study Materials';
  }
}

// ─── MODAL ───
function openNewLectureModal() {
  document.getElementById('newLectureModal').classList.add('open');
  document.getElementById('lectureTitle').focus();
  checkMicPermission();
}

function closeNewLectureModal() {
  document.getElementById('newLectureModal').classList.remove('open');
  document.getElementById('lectureTitle').value = '';
  document.getElementById('lectureSubject').value = '';
  document.getElementById('recordingTranscriptText').value = '';
  document.getElementById('uploadTranscriptText').value = '';
  document.getElementById('pasteText').value = '';
  document.getElementById('recordTimer').textContent = '00:00';
  document.getElementById('recordStatus').textContent = 'Tap to start recording your lecture';
  document.getElementById('recordBtn').textContent = '🎙️';
  document.getElementById('recorderArea').classList.remove('recording');
  document.getElementById('recordingTranscriptPreview').style.display = 'none';
  recordingBlob = null;
  clearFile();
  switchInputTab('record');
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
}

document.getElementById('newLectureModal')?.addEventListener('click', function (e) {
  if (e.target === this) closeNewLectureModal();
});

// ─── DELETE ───
function confirmDelete(id) {
  deletePendingId = id;
  document.getElementById('confirmModal').classList.add('open');
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    try {
      await apiDelete(`/lectures/${deletePendingId}`);
      closeConfirmModal();
      showToast('Lecture deleted.', 'success');
      activeLectureId = null;
      activeLecture = null;
      document.getElementById('lectureViewContainer').style.display = 'none';
      document.getElementById('welcomeView').style.display = 'flex';
      await loadLectures();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('open');
  deletePendingId = null;
}

document.getElementById('confirmModal')?.addEventListener('click', function (e) {
  if (e.target === this) closeConfirmModal();
});

// ─── EXPORT ───
function exportNotes() {
  if (!activeLecture) return;
  const notes = activeLecture.notes || [];
  let text = `# ${activeLecture.title}\n`;
  if (activeLecture.subject) text += `**Subject:** ${activeLecture.subject}\n`;
  text += `**Date:** ${formatDate(activeLecture.created_at)}\n\n---\n\n`;

  notes.forEach(note => {
    if (note.type === 'summary') text += `## Summary\n\n${note.content}\n\n`;
    if (note.type === 'outline') text += `## Outline\n\n${note.content}\n\n`;
    if (note.type === 'flashcards' && note.flashcards) {
      text += `## Flashcards\n\n`;
      note.flashcards.forEach((c, i) => text += `**Q${i + 1}:** ${c.front}\n**A:** ${c.back}\n\n`);
    }
    if (note.type === 'quiz' && note.questions) {
      text += `## Quiz\n\n`;
      note.questions.forEach((q, i) => {
        text += `**Q${i + 1}:** ${q.question}\n`;
        text += `a) ${q.option_a}  b) ${q.option_b}  c) ${q.option_c}  d) ${q.option_d}\n`;
        text += `**Answer:** ${q.correct_answer.toUpperCase()}\n\n`;
      });
    }
  });

  downloadText(text, `${activeLecture.title.replace(/\s+/g, '-')}-notes.md`);
  showToast('Notes exported!', 'success');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
}

function downloadText(text, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = filename;
  a.click();
}

// ─── HOW IT WORKS ───
function showAbout() {
  showToast('Sign in → record, upload audio/video, or paste text → AI transcribes & generates notes, outlines, flashcards & quizzes.', 'info');
}

// ─── UTILS ───
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function statusLabel(status) {
  const map = { completed: '✓ Ready', processing: '⟳ Processing', pending: '○ Pending', failed: '✕ Failed' };
  return map[status] || status;
}

function simpleMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul]|<li|<\/[hul])(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
