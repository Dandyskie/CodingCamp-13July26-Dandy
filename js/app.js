// ============================================
// Life Dashboard — app.js
// ============================================
// Sections
//  1.  Utility Functions
//  2.  StorageService
//  3.  NotificationService
//  4.  ModalService
//  5.  ThemeManager
//  6.  GreetingWidget
//  7.  FocusTimer
//  8.  QuoteDisplay
//  9.  TaskManager
// 10.  QuickLinks
// 11.  App Initialization
// ============================================

/* ============================================
   SECTION 1 — Utility Functions
   ============================================ */

/** Unique ID: timestamp-based with random suffix */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Format Date → 12-hour AM/PM  e.g. "9:05 AM"
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  let h = date.getHours();
  const m   = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Format Date → human-readable  e.g. "Monday, July 14, 2025"
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/**
 * Validate & normalise URL. Auto-prepends https:// if no protocol.
 * @param {string} url
 * @returns {{ valid: boolean, url: string }}
 */
function isValidUrl(url) {
  const s = (url || '').trim();
  if (!s) return { valid: false, url: '' };
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const p = new URL(withProto);
    return (p.protocol === 'http:' || p.protocol === 'https:')
      ? { valid: true, url: withProto }
      : { valid: false, url: '' };
  } catch {
    return { valid: false, url: '' };
  }
}

/**
 * Debounce: delay fn execution until `wait` ms after last call.
 * @param {Function} fn
 * @param {number}   wait  ms
 * @returns {Function}
 */
function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Escape HTML special chars to prevent XSS */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

/* ============================================
   SECTION 2 — StorageService
   All keys are stored with the 'dashboard_' prefix.
   ============================================ */

const StorageService = (() => {
  const PREFIX = 'dashboard_';

  return {
    /** @returns {boolean} true if Local Storage is usable */
    isAvailable() {
      try {
        const k = PREFIX + '__test__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
      } catch { return false; }
    },

    /**
     * Read & JSON-parse a value.
     * @param {string} key  (prefix added automatically)
     * @returns {*|null}
     */
    get(key) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw !== null ? JSON.parse(raw) : null;
      } catch { return null; }
    },

    /**
     * JSON-stringify & persist a value.
     * @param {string} key
     * @param {*}      value
     * @returns {boolean}
     */
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          NotificationService.error('Storage is full. Delete some items to free space.');
        } else {
          NotificationService.error('Failed to save data.');
        }
        return false;
      }
    },

    /**
     * Remove a key.
     * @param {string} key
     * @returns {boolean}
     */
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); return true; }
      catch { return false; }
    },
  };
})();

/* ============================================
   SECTION 3 — NotificationService
   Toast notifications rendered in #toastContainer.
   Container has pointer-events:none; toasts have pointer-events:auto.
   ============================================ */

const NotificationService = (() => {
  function show(message, type, duration) {
    type     = type     || 'info';
    duration = duration || 3000;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, duration);
  }

  return {
    show,
    success(msg) { show(msg, 'success'); },
    error(msg)   { show(msg, 'error'); },
    info(msg)    { show(msg, 'info'); },
  };
})();

/* ============================================
   SECTION 4 — ModalService
   Confirmation dialog using #modalOverlay.
   ESC key closes the modal.
   ============================================ */

const ModalService = (() => {
  let _cbConfirm = null;
  let _cbCancel  = null;
  let _mode      = 'confirm'; // 'confirm' | 'alert' | 'prompt'

  function escHandler(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
    document.removeEventListener('keydown', escHandler);
    const cb = _cbCancel;
    _cbConfirm = null;
    _cbCancel  = null;
    if (cb) cb();
  }

  function setupModal(title, message, mode) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const msgEl   = document.getElementById('modalMessage');
    const inpCont = document.getElementById('modalInputContainer');
    const confBtn = document.getElementById('modalConfirmBtn');
    const cancBtn = document.getElementById('modalCancelBtn');

    if (!overlay || !titleEl || !msgEl || !inpCont || !confBtn || !cancBtn) return null;

    titleEl.textContent = title;
    msgEl.textContent = message;
    _mode = mode;

    if (mode === 'alert') {
      inpCont.classList.add('hidden');
      cancBtn.classList.add('hidden');
      confBtn.textContent = 'OK';
    } else if (mode === 'prompt') {
      inpCont.classList.remove('hidden');
      cancBtn.classList.remove('hidden');
      confBtn.textContent = 'Save';
      cancBtn.textContent = 'Cancel';
      const input = document.getElementById('modalInputField');
      if (input) { input.value = ''; input.focus(); }
    } else { // confirm
      inpCont.classList.add('hidden');
      cancBtn.classList.remove('hidden');
      confBtn.textContent = 'Confirm';
      cancBtn.textContent = 'Cancel';
    }

    // Clone buttons to remove old event listeners
    const newConf = confBtn.cloneNode(true);
    const newCanc = cancBtn.cloneNode(true);
    confBtn.parentNode.replaceChild(newConf, confBtn);
    cancBtn.parentNode.replaceChild(newCanc, cancBtn);

    overlay.classList.remove('hidden');
    document.addEventListener('keydown', escHandler);

    return { newConf, newCanc };
  }

  return {
    alert(message, title = 'Alert') {
      return new Promise((resolve) => {
        const btns = setupModal(title, message, 'alert');
        if (!btns) return resolve();
        btns.newConf.addEventListener('click', () => {
          const overlay = document.getElementById('modalOverlay');
          if (overlay) overlay.classList.add('hidden');
          document.removeEventListener('keydown', escHandler);
          resolve();
        });
      });
    },

    confirm(message, onConfirm, onCancel, title = 'Confirm Action') {
      const btns = setupModal(title, message, 'confirm');
      if (!btns) return;
      _cbConfirm = onConfirm || null;
      _cbCancel  = onCancel  || null;

      btns.newConf.addEventListener('click', () => {
        const cb = _cbConfirm;
        _cbConfirm = null; _cbCancel = null;
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.classList.add('hidden');
        document.removeEventListener('keydown', escHandler);
        if (cb) cb();
      });

      btns.newCanc.addEventListener('click', () => {
        _cbConfirm = null;
        close();
      });
    },

    prompt(message, placeholder = '', onConfirm, onCancel, title = 'Input Required') {
      const btns = setupModal(title, message, 'prompt');
      if (!btns) return;
      _cbConfirm = onConfirm || null;
      _cbCancel  = onCancel  || null;

      const input = document.getElementById('modalInputField');
      if (input && placeholder) input.placeholder = placeholder;

      btns.newConf.addEventListener('click', () => {
        const val = input ? input.value.trim() : '';
        const cb = _cbConfirm;
        _cbConfirm = null; _cbCancel = null;
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.classList.add('hidden');
        document.removeEventListener('keydown', escHandler);
        if (cb) cb(val);
      });

      btns.newCanc.addEventListener('click', () => {
        _cbConfirm = null;
        close();
      });
    },

    close,
  };
})();

/* ============================================
   SECTION 5 — ThemeManager
   Toggles 'light-theme' class on <body>.
   Default: dark. Persisted to storage key 'theme'.
   ============================================ */

const ThemeManager = (() => {
  const KEY        = 'theme';
  const LIGHT_CLASS = 'light-theme';

  function applyIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = (theme === 'dark') ? '🌙' : '☀️';
  }

  return {
    init() {
      const saved = StorageService.get(KEY) || 'dark';
      this.setTheme(saved);
    },

    toggle() {
      this.setTheme(this.getCurrentTheme() === 'dark' ? 'light' : 'dark');
    },

    getCurrentTheme() {
      return document.body.classList.contains(LIGHT_CLASS) ? 'light' : 'dark';
    },

    /** @param {'light'|'dark'} theme */
    setTheme(theme) {
      if (theme === 'light') {
        document.body.classList.add(LIGHT_CLASS);
      } else {
        document.body.classList.remove(LIGHT_CLASS);
      }
      StorageService.set(KEY, theme);
      applyIcon(theme);
    },
  };
})();

/* ============================================
   SECTION 6 — GreetingWidget
   Displays time (12-hr), date, time-based greeting
   and personalised name from #usernameInput.
   Updates every minute.
   ============================================ */

const GreetingWidget = (() => {
  const KEY = 'username';
  let _interval = null;

  function greetingPhrase(hour) {
    if (hour >= 5  && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 18) return 'Good Afternoon';
    if (hour >= 18 && hour < 22) return 'Good Evening';
    return 'Good Night';  // 22 – 4
  }

  return {
    init() {
      const input = document.getElementById('usernameInput');
      if (input) {
        input.value = StorageService.get(KEY) || '';

        const debouncedSave = debounce((val) => {
          StorageService.set(KEY, val);
          this.updateTime();
        }, 500);

        input.addEventListener('input', (e) => debouncedSave(e.target.value.trim()));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      }

      this.updateTime();
      if (_interval) clearInterval(_interval);
      _interval = setInterval(() => this.updateTime(), 60000);

      // On load, if username is empty, prompt the user for their name
      const storedName = StorageService.get(KEY);
      if (!storedName) {
        setTimeout(() => {
          ModalService.prompt(
            'Please enter your name to personalize your dashboard:',
            'Your name...',
            (name) => {
              if (name) {
                this.setUserName(name);
                if (input) input.value = name;
              }
            },
            null,
            'Welcome!'
          );
        }, 800);
      }
    },

    updateTime() {
      const now  = new Date();
      const tEl  = document.getElementById('timeDisplay');
      const dEl  = document.getElementById('dateDisplay');
      const gEl  = document.getElementById('greetingText');
      const iEl  = document.getElementById('usernameInput');

      if (tEl) tEl.textContent = formatTime(now);
      if (dEl) dEl.textContent = formatDate(now);

      if (gEl) {
        const name   = (iEl && iEl.value.trim()) || StorageService.get(KEY) || '';
        const phrase = greetingPhrase(now.getHours());
        gEl.textContent = name ? `${phrase}, ${name}!` : `${phrase}!`;
      }
    },

    setUserName(name) {
      StorageService.set(KEY, name);
      this.updateTime();
    },
  };
})();

/* ============================================
   SECTION 7 — FocusTimer
   Pomodoro-style countdown. Default 25 min.
   States: IDLE | RUNNING | PAUSED | COMPLETE
   ============================================ */

const FocusTimer = (() => {
  const KEY      = 'timer_duration';
  const DEFAULT  = 1500; // 25 × 60 seconds

  const S = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', COMPLETE: 'COMPLETE' };

  let _duration  = DEFAULT;
  let _remaining = DEFAULT;
  let _state     = S.IDLE;
  let _tick      = null;

  function mmss(sec) {
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  function display() {
    const el = document.getElementById('timerDisplay');
    if (el) el.textContent = mmss(_remaining);
  }

  function syncButtons() {
    const sBtn = document.getElementById('timerStartBtn');
    const pBtn = document.getElementById('timerStopBtn');
    const rBtn = document.getElementById('timerResetBtn');
    if (!sBtn || !pBtn || !rBtn) return;

    sBtn.disabled = (_state === S.RUNNING);
    pBtn.disabled = (_state !== S.RUNNING);
    rBtn.disabled = (_state === S.IDLE);
    sBtn.textContent = (_state === S.PAUSED) ? 'Resume' : 'Start';
  }

  function onTick() {
    if (_remaining <= 0) {
      clearInterval(_tick); _tick = null;
      _state = S.COMPLETE;
      display(); syncButtons();
      NotificationService.info("⏰ Time's up! Take a break.");
      return;
    }
    _remaining--;
    display();
  }

  return {
    init() {
      const saved = StorageService.get(KEY);
      _duration  = (saved && !isNaN(Number(saved))) ? Number(saved) : DEFAULT;
      _remaining = _duration;

      display(); syncButtons();

      const durInput = document.getElementById('timerDurationInput');
      if (durInput) {
        durInput.value = Math.floor(_duration / 60);
        durInput.addEventListener('change', (e) => {
          const mins = parseInt(e.target.value, 10);
          if (!isNaN(mins) && mins >= 1) this.setDuration(mins);
          else durInput.value = Math.floor(_duration / 60);
        });
      }

      const sBtn = document.getElementById('timerStartBtn');
      const pBtn = document.getElementById('timerStopBtn');
      const rBtn = document.getElementById('timerResetBtn');
      if (sBtn) sBtn.addEventListener('click', () => this.start());
      if (pBtn) pBtn.addEventListener('click', () => this.stop());
      if (rBtn) rBtn.addEventListener('click', () => this.reset());
    },

    start() {
      if (_state === S.RUNNING) return;
      if (_state === S.IDLE || _state === S.COMPLETE) { _remaining = _duration; display(); }
      _state = S.RUNNING; syncButtons();
      _tick  = setInterval(onTick, 1000);
    },

    stop() {
      if (_state !== S.RUNNING) return;
      clearInterval(_tick); _tick = null;
      _state = S.PAUSED; syncButtons();
    },

    reset() {
      clearInterval(_tick); _tick = null;
      _remaining = _duration; _state = S.IDLE;
      display(); syncButtons();
    },

    /** @param {number} minutes */
    setDuration(minutes) {
      clearInterval(_tick); _tick = null;
      _duration  = minutes * 60;
      _remaining = _duration;
      _state     = S.IDLE;
      StorageService.set(KEY, _duration);
      display(); syncButtons();
    },
  };
})();

/* ============================================
   SECTION 8 — QuoteDisplay
   17 hardcoded quotes. Avoids immediate repeat.
   ============================================ */

const QuoteDisplay = (() => {
  const QUOTES = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
    { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
    { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  ];

  let _last = -1;

  return {
    init() {
      const btn = document.getElementById('newQuoteBtn');
      if (btn) btn.addEventListener('click', () => this.showRandomQuote());
      this.showRandomQuote();
    },

    showRandomQuote() {
      let idx;
      do { idx = Math.floor(Math.random() * QUOTES.length); }
      while (idx === _last && QUOTES.length > 1);
      _last = idx;

      const q      = QUOTES[idx];
      const textEl = document.getElementById('quoteText');
      const authEl = document.getElementById('quoteAuthor');
      if (textEl) textEl.textContent = `"${q.text}"`;
      if (authEl) authEl.textContent = `— ${q.author}`;
    },
  };
})();

/* ============================================
   SECTION 9 — TaskManager
   Full CRUD with sort, progress bar,
   inline editing, animations, auto-save indicator.
   ============================================ */

const TaskManager = (() => {
  const TASKS_KEY = 'tasks';
  const SORT_KEY  = 'task_sort';

  /** @type {Array<{id:string,text:string,completed:boolean,createdAt:number,updatedAt:number}>} */
  let _tasks = [];
  let _sort  = 'creation';

  // Debounced persist to avoid hammering storage on rapid changes
  const _persist = debounce(() => {
    StorageService.set(TASKS_KEY, _tasks);
    _flashAutoSave();
  }, 300);

  function _flashAutoSave() {
    const el = document.getElementById('taskAutoSave');
    if (!el) return;
    el.textContent = 'Saved ✓';
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  }

  function _sorted() {
    const c = [..._tasks];
    if (_sort === 'alphabetical') return c.sort((a, b) => a.text.localeCompare(b.text));
    if (_sort === 'completion')   return c.sort((a, b) => Number(a.completed) - Number(b.completed));
    return c.sort((a, b) => a.createdAt - b.createdAt); // creation order
  }

  function _renderItem(task) {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' completed' : ''}`;
    li.dataset.taskId = task.id;

    li.innerHTML = `
      <input type="checkbox" class="task-checkbox" aria-label="Toggle task completion"${task.completed ? ' checked' : ''}>
      <span class="task-text">${escapeHtml(task.text)}</span>
      <div class="task-actions">
        <button class="btn btn-secondary task-edit-btn" aria-label="Edit task">✏️</button>
        <button class="btn btn-secondary task-delete-btn" aria-label="Delete task">🗑️</button>
      </div>
    `;
    return li;
  }

  function _render() {
    const list  = document.getElementById('taskList');
    const empty = document.getElementById('taskEmptyState');
    const bar   = document.getElementById('progressBar');
    const stats = document.getElementById('taskStats');
    if (!list) return;

    const total     = _tasks.length;
    const done      = _tasks.filter(t => t.completed).length;
    const pct       = total ? Math.round((done / total) * 100) : 0;

    if (bar)   bar.style.width    = `${pct}%`;
    if (stats) stats.textContent  = `${done} of ${total} completed`;

    if (total === 0) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const frag = document.createDocumentFragment();
    _sorted().forEach(t => frag.appendChild(_renderItem(t)));
    list.innerHTML = '';
    list.appendChild(frag);
  }

  function _enterEdit(li, task) {
    if (li.classList.contains('editing')) return;
    li.classList.add('editing');

    const span    = li.querySelector('.task-text');
    const actions = li.querySelector('.task-actions');
    if (span)    span.style.display    = 'none';
    if (actions) actions.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'task-edit-controls';

    const inp  = document.createElement('input');
    inp.type      = 'text';
    inp.className = 'edit-input';
    inp.value     = task.text;
    inp.maxLength = 500;
    inp.setAttribute('aria-label', 'Edit task text');

    const saveBtn   = document.createElement('button');
    saveBtn.className   = 'btn btn-primary task-save-edit-btn';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'btn btn-secondary task-cancel-edit-btn';
    cancelBtn.textContent = 'Cancel';

    wrap.appendChild(inp);
    wrap.appendChild(saveBtn);
    wrap.appendChild(cancelBtn);
    li.appendChild(wrap);
    inp.focus(); inp.select();

    function doSave() {
      const val = inp.value.trim();
      if (val && val !== task.text) {
        TaskManager.editTask(task.id, val);
      } else {
        exitEdit();
      }
    }

    function exitEdit() {
      li.classList.remove('editing');
      if (span)    span.style.display    = '';
      if (actions) actions.style.display = '';
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    saveBtn.addEventListener('click', doSave);
    cancelBtn.addEventListener('click', exitEdit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
      if (e.key === 'Escape') { e.preventDefault(); exitEdit(); }
    });
  }

  return {
    init() {
      _tasks = StorageService.get(TASKS_KEY) || [];
      _sort  = StorageService.get(SORT_KEY)  || 'creation';

      const sortSel = document.getElementById('taskSortSelect');
      if (sortSel) {
        sortSel.value = _sort;
        sortSel.addEventListener('change', (e) => this.sortTasks(e.target.value));
      }

      const form  = document.getElementById('taskInputForm');
      const input = document.getElementById('taskInput');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (input) { this.addTask(input.value); input.value = ''; }
        });
      }

      // Event delegation on the list
      const list = document.getElementById('taskList');
      if (list) {
        list.addEventListener('click', (e) => {
          const li = e.target.closest('.task-item');
          if (!li) return;
          const id = li.dataset.taskId;

          if (e.target.matches('.task-checkbox'))   this.toggleTask(id);
          else if (e.target.matches('.task-delete-btn')) this.deleteTask(id);
          else if (e.target.matches('.task-edit-btn')) {
            const task = _tasks.find(t => t.id === id);
            if (task) _enterEdit(li, task);
          }
        });
      }

      _render();
    },

    addTask(text) {
      const t = (text || '').trim();
      if (!t) { ModalService.alert('Task cannot be empty.'); return false; }
      if (t.length > 500) { ModalService.alert('Task is too long (max 500 characters).'); return false; }
      if (_tasks.some(x => x.text.toLowerCase() === t.toLowerCase())) {
        ModalService.alert('That task already exists.'); return false;
      }
      const now = Date.now();
      _tasks.push({ id: generateId(), text: t, completed: false, createdAt: now, updatedAt: now });
      _persist(); _render();
      NotificationService.success('Task added.');
      return true;
    },

    editTask(id, newText) {
      const t = (newText || '').trim();
      if (!t) { ModalService.alert('Task text cannot be empty.'); return false; }
      if (t.length > 500) { ModalService.alert('Task is too long (max 500 characters).'); return false; }
      if (_tasks.some(x => x.id !== id && x.text.toLowerCase() === t.toLowerCase())) {
        ModalService.alert('A task with that text already exists.'); return false;
      }
      const task = _tasks.find(x => x.id === id);
      if (!task) return false;
      task.text = t; task.updatedAt = Date.now();
      _persist(); _render();
      return true;
    },

    deleteTask(id) {
      ModalService.confirm('Delete this task?', () => {
        const li = document.querySelector(`.task-item[data-task-id="${id}"]`);
        if (li) {
          li.style.animation = 'fadeOut 0.3s ease forwards';
          setTimeout(() => {
            _tasks = _tasks.filter(t => t.id !== id);
            _persist(); _render();
            NotificationService.success('Task deleted.');
          }, 300);
        } else {
          _tasks = _tasks.filter(t => t.id !== id);
          _persist(); _render();
          NotificationService.success('Task deleted.');
        }
      });
    },

    toggleTask(id) {
      const task = _tasks.find(t => t.id === id);
      if (!task) return;
      task.completed = !task.completed;
      task.updatedAt = Date.now();
      _persist(); _render();
    },

    sortTasks(criteria) {
      _sort = criteria || 'creation';
      StorageService.set(SORT_KEY, _sort);
      _render();
    },

    getTasks()    { return [..._tasks]; },
    getProgress() {
      const total = _tasks.length;
      const done  = _tasks.filter(t => t.completed).length;
      return { total, completed: done, percentage: total ? Math.round((done / total) * 100) : 0 };
    },
  };
})();

/* ============================================
   SECTION 10 — QuickLinks
   Add / delete / render favourite website shortcuts.
   Opens links in new tab. URL auto-prefixed with https://.
   ============================================ */

const QuickLinks = (() => {
  const KEY = 'quicklinks';

  /** @type {Array<{id:string,name:string,url:string,createdAt:number}>} */
  let _links = [];

  function _persist() { StorageService.set(KEY, _links); }

  function _createCard(link) {
    const div = document.createElement('div');
    div.className  = 'quicklink-item';
    div.dataset.linkId = link.id;

    const displayUrl = link.url.length > 45 ? link.url.slice(0, 42) + '...' : link.url;

    div.innerHTML = `
      <a class="quicklink-name" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(link.name)}">${escapeHtml(link.name)}</a>
      <span class="quicklink-url" title="${escapeHtml(link.url)}">${escapeHtml(displayUrl)}</span>
      <button class="btn btn-secondary quicklink-delete-btn" aria-label="Delete ${escapeHtml(link.name)}">🗑️ Delete</button>
    `;
    return div;
  }

  function _render() {
    const grid  = document.getElementById('quicklinksGrid');
    const empty = document.getElementById('quicklinksEmptyState');
    if (!grid) return;

    grid.innerHTML = '';
    if (_links.length === 0) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const frag = document.createDocumentFragment();
    _links.forEach(l => frag.appendChild(_createCard(l)));
    grid.appendChild(frag);
  }

  return {
    init() {
      _links = StorageService.get(KEY) || [];

      const form  = document.getElementById('quicklinkInputForm');
      const nameI = document.getElementById('quicklinkNameInput');
      const urlI  = document.getElementById('quicklinkUrlInput');

      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (this.addLink(nameI ? nameI.value : '', urlI ? urlI.value : '')) {
            if (nameI) nameI.value = '';
            if (urlI)  urlI.value  = '';
          }
        });
      }

      const grid = document.getElementById('quicklinksGrid');
      if (grid) {
        grid.addEventListener('click', (e) => {
          if (e.target.matches('.quicklink-delete-btn')) {
            const card = e.target.closest('.quicklink-item');
            if (card) this.deleteLink(card.dataset.linkId);
          }
        });
      }

      _render();
    },

    addLink(name, url) {
      const n = (name || '').trim();
      const u = (url  || '').trim();

      if (!n) { ModalService.alert('Link name cannot be empty.'); return false; }
      if (n.length > 50) { ModalService.alert('Name is too long (max 50 characters).'); return false; }

      const { valid, url: normalised } = isValidUrl(u);
      if (!valid) { ModalService.alert('Please enter a valid URL.'); return false; }

      _links.push({ id: generateId(), name: n, url: normalised, createdAt: Date.now() });
      _persist(); _render();
      NotificationService.success('Quick link added.');
      return true;
    },

    deleteLink(id) {
      const card = document.querySelector(`.quicklink-item[data-link-id="${id}"]`);
      if (card) {
        card.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
          _links = _links.filter(l => l.id !== id);
          _persist(); _render();
          NotificationService.success('Quick link deleted.');
        }, 300);
      } else {
        _links = _links.filter(l => l.id !== id);
        _persist(); _render();
        NotificationService.success('Quick link deleted.');
      }
    },

    getLinks() { return [..._links]; },
  };
})();

/* ============================================
   SECTION 10.5 — MusicPlayer
   ============================================ */

const MusicPlayer = (() => {
  const KEY = 'playlist';
  
  const DEFAULT_PLAYLIST = [
    { id: '1', title: 'Lofi Study', artist: 'Freesound Chill', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { id: '2', title: 'Chill Breeze', artist: 'Freesound Relax', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { id: '3', title: 'Late Night Coffee', artist: 'Freesound Midnight', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' }
  ];

  let _playlist = [];
  let _currentIndex = 0;
  let _isPlaying = false;

  function _persist() { StorageService.set(KEY, _playlist); }

  function _render() {
    const list = document.getElementById('musicPlaylist');
    if (!list) return;

    list.innerHTML = '';
    _playlist.forEach((track, index) => {
      const li = document.createElement('li');
      li.className = `music-playlist-item${index === _currentIndex && _isPlaying ? ' active' : ''}`;
      li.dataset.index = index;
      li.innerHTML = `
        <span class="music-playlist-title">${escapeHtml(track.title)} - ${escapeHtml(track.artist)}</span>
        <button class="music-playlist-delete" data-id="${track.id}">🗑️</button>
      `;
      list.appendChild(li);
    });
  }

  function _loadTrack(index) {
    const audio = document.getElementById('bgAudioPlayer');
    const titleEl = document.getElementById('musicTitle');
    const artistEl = document.getElementById('musicArtist');
    if (!audio || _playlist.length === 0) return;

    if (index < 0) index = _playlist.length - 1;
    if (index >= _playlist.length) index = 0;

    _currentIndex = index;
    const track = _playlist[_currentIndex];
    audio.src = track.url;
    audio.load();

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;
  }

  return {
    init() {
      _playlist = StorageService.get(KEY) || [];
      if (_playlist.length === 0) {
        _playlist = [...DEFAULT_PLAYLIST];
        _persist();
      }

      const audio = document.getElementById('bgAudioPlayer');
      const playBtn = document.getElementById('musicPlayBtn');
      const prevBtn = document.getElementById('musicPrevBtn');
      const nextBtn = document.getElementById('musicNextBtn');
      const seeker = document.getElementById('musicTimeSeeker');
      const curTime = document.getElementById('musicCurrentTime');
      const totTime = document.getElementById('musicTotalDuration');
      const volume = document.getElementById('musicVolumeSlider');
      const addForm = document.getElementById('musicAddForm');
      const playlistEl = document.getElementById('musicPlaylist');

      if (!audio) return;

      _loadTrack(0);
      _render();

      // Audio Event Handlers
      audio.addEventListener('timeupdate', () => {
        if (!isNaN(audio.duration) && audio.duration > 0) {
          const pct = (audio.currentTime / audio.duration) * 100;
          if (seeker) seeker.value = pct;
        }
        if (curTime) {
          const m = Math.floor(audio.currentTime / 60);
          const s = String(Math.floor(audio.currentTime % 60)).padStart(2, '0');
          curTime.textContent = `${m}:${s}`;
        }
      });

      audio.addEventListener('loadedmetadata', () => {
        if (totTime && !isNaN(audio.duration)) {
          const m = Math.floor(audio.duration / 60);
          const s = String(Math.floor(audio.duration % 60)).padStart(2, '0');
          totTime.textContent = `${m}:${s}`;
        }
      });

      audio.addEventListener('ended', () => {
        this.next();
      });

      // Playback Controls
      if (playBtn) {
        playBtn.addEventListener('click', () => {
          if (_isPlaying) this.pause();
          else this.play();
        });
      }

      if (prevBtn) prevBtn.addEventListener('click', () => this.prev());
      if (nextBtn) nextBtn.addEventListener('click', () => this.next());

      if (seeker) {
        seeker.addEventListener('input', (e) => {
          if (!isNaN(audio.duration)) {
            audio.currentTime = (e.target.value / 100) * audio.duration;
          }
        });
      }

      if (volume) {
        volume.addEventListener('input', (e) => {
          audio.volume = e.target.value;
        });
      }

      // Add Song Handler
      if (addForm) {
        addForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const titleInput = document.getElementById('musicAddTitle');
          const artistInput = document.getElementById('musicAddArtist');
          const urlInput = document.getElementById('musicAddUrl');

          if (titleInput && artistInput && urlInput) {
            this.addSong(titleInput.value, artistInput.value, urlInput.value);
            titleInput.value = '';
            artistInput.value = '';
            urlInput.value = '';
          }
        });
      }

      // Playlist Item Clicks
      if (playlistEl) {
        playlistEl.addEventListener('click', (e) => {
          const deleteBtn = e.target.closest('.music-playlist-delete');
          if (deleteBtn) {
            e.stopPropagation();
            const id = deleteBtn.dataset.id;
            this.deleteSong(id);
            return;
          }
          const li = e.target.closest('.music-playlist-item');
          if (li) {
            const index = parseInt(li.dataset.index, 10);
            _loadTrack(index);
            this.play();
          }
        });
      }
    },

    play() {
      const audio = document.getElementById('bgAudioPlayer');
      const playBtn = document.getElementById('musicPlayBtn');
      if (!audio) return;
      audio.play().then(() => {
        _isPlaying = true;
        if (playBtn) playBtn.textContent = '⏸️';
        _render();
      }).catch(err => {
        console.error('Audio play error:', err);
        ModalService.alert('Failed to play audio track. Please verify your Audio URL.');
      });
    },

    pause() {
      const audio = document.getElementById('bgAudioPlayer');
      const playBtn = document.getElementById('musicPlayBtn');
      if (!audio) return;
      audio.pause();
      _isPlaying = false;
      if (playBtn) playBtn.textContent = '▶️';
      _render();
    },

    next() {
      if (_playlist.length === 0) return;
      _loadTrack((_currentIndex + 1) % _playlist.length);
      if (_isPlaying) this.play();
      else _render();
    },

    prev() {
      if (_playlist.length === 0) return;
      _loadTrack((_currentIndex - 1 + _playlist.length) % _playlist.length);
      if (_isPlaying) this.play();
      else _render();
    },

    addSong(title, artist, url) {
      const t = (title || '').trim();
      const a = (artist || '').trim();
      const u = (url || '').trim();

      if (!t || !a) {
        ModalService.alert('Song Title and Artist Name cannot be empty.');
        return;
      }

      const { valid, url: normalised } = isValidUrl(u);
      if (!valid) {
        ModalService.alert('Please enter a valid URL.');
        return;
      }

      _playlist.push({ id: generateId(), title: t, artist: a, url: normalised });
      _persist();
      _render();
      ModalService.alert('Song added successfully to your playlist!', 'Success');
    },

    deleteSong(id) {
      ModalService.confirm('Remove this song from the playlist?', () => {
        const deletedIndex = _playlist.findIndex(t => t.id === id);
        if (deletedIndex === -1) return;

        _playlist = _playlist.filter(t => t.id !== id);
        _persist();

        if (_playlist.length === 0) {
          this.pause();
          const titleEl = document.getElementById('musicTitle');
          const artistEl = document.getElementById('musicArtist');
          if (titleEl) titleEl.textContent = 'No Song Playing';
          if (artistEl) artistEl.textContent = '-';
        } else if (deletedIndex === _currentIndex) {
          _loadTrack(0);
          if (_isPlaying) this.play();
        } else {
          if (deletedIndex < _currentIndex) {
            _currentIndex--;
          }
          _render();
        }
      });
    }
  };
})();

/* ============================================
   SECTION 11 — App Initialization
   Bootstraps all components on DOMContentLoaded.
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Check storage availability first
  if (!StorageService.isAvailable()) {
    NotificationService.error(
      'Local Storage is unavailable (e.g. private browsing). Your data will not be saved.'
    );
  }

  // Inject auto-save indicator into the Tasks section heading
  const taskSection = document.getElementById('taskManager');
  if (taskSection) {
    const h2 = taskSection.querySelector('h2');
    if (h2) {
      const ind = document.createElement('span');
      ind.id        = 'taskAutoSave';
      ind.className = 'auto-save-indicator';
      h2.appendChild(ind);
    }
  }

  // Initialise components in dependency order
  ThemeManager.init();
  GreetingWidget.init();
  FocusTimer.init();
  QuoteDisplay.init();
  TaskManager.init();
  QuickLinks.init();
  MusicPlayer.init();

  // Theme toggle button (in addition to ThemeManager.init hooking it internally)
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => ThemeManager.toggle());
  }

  // Global uncaught-error handler
  window.addEventListener('error', (ev) => {
    console.error('Global error:', ev.error);
    NotificationService.error('Something went wrong. Please refresh the page.');
  });

  // Global unhandled-promise-rejection handler
  window.addEventListener('unhandledrejection', (ev) => {
    console.error('Unhandled rejection:', ev.reason);
    NotificationService.error('An unexpected error occurred.');
  });
});
