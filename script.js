(function(){
  const STORAGE_KEY = 'recipeBoxData_v1';
  const REMOTE_CONFIG = (window.RECIPE_DB_CONFIG && typeof window.RECIPE_DB_CONFIG === 'object')
    ? window.RECIPE_DB_CONFIG
    : {};

  let state = {
    recipes: [],
    categories: [],
    activeId: null,
    filter: '',
    activeTag: 'All'
  };

  function normalizeRecipeData(payload) {
    const rawRecipes = Array.isArray(payload?.recipes)
      ? payload.recipes
      : Array.isArray(payload)
        ? payload
        : [];

    const normalizedRecipes = rawRecipes.map(r => ({
      id: r.id || uid(),
      title: r.title || 'Untitled recipe',
      description: r.description || '',
      category: r.category || 'Uncategorized',
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      prepTime: r.prepTime || '',
      cookTime: r.cookTime || '',
      baseServings: Number.isFinite(r.baseServings) ? r.baseServings : 1,
      currentServings: r.currentServings || null,
      ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(i => ({
        amount: i.amount == null ? null : parseFloat(i.amount),
        unit: i.unit || '',
        name: i.name || ''
      })) : [],
      steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
      notes: r.notes || ''
    }));

    const categories = Array.isArray(payload?.categories)
      ? payload.categories
      : Array.from(new Set(normalizedRecipes.map(r => r.category || 'Uncategorized').filter(Boolean)));

    return {
      recipes: normalizedRecipes,
      categories
    };
  }

  let remoteDb = null;
  let remoteDocRef = null;
  let remoteReady = false;

  function setStorageStatus(mode, message) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.textContent = mode === 'cloud'
      ? `Cloud sync: ${message}`
      : `Storage: ${message}`;
    el.classList.toggle('is-cloud', mode === 'cloud');
  }

  function isRemoteConfigured() {
    return Boolean(
      REMOTE_CONFIG.enabled &&
      REMOTE_CONFIG.apiKey &&
      REMOTE_CONFIG.authDomain &&
      REMOTE_CONFIG.projectId &&
      REMOTE_CONFIG.appId
    );
  }

  async function initRemoteStorage() {
    if (!isRemoteConfigured() || !window.firebase) {
      setStorageStatus('local', 'local browser storage');
      return;
    }

    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp({
          apiKey: REMOTE_CONFIG.apiKey,
          authDomain: REMOTE_CONFIG.authDomain,
          projectId: REMOTE_CONFIG.projectId,
          storageBucket: REMOTE_CONFIG.storageBucket || '',
          messagingSenderId: REMOTE_CONFIG.messagingSenderId || '',
          appId: REMOTE_CONFIG.appId
        });
      }

      remoteDb = window.firebase.firestore();
      remoteDocRef = remoteDb.collection('recipeBox').doc('main');
      await window.firebase.auth().signInAnonymously();
      remoteReady = true;

      const snap = await remoteDocRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (Array.isArray(data.recipes) && !state.recipes.length) {
          state.recipes = data.recipes;
          state.categories = Array.isArray(data.categories) ? data.categories : [];
          if (!state.activeId && state.recipes.length) {
            state.activeId = state.recipes[0].id;
          }
          setStorageStatus('cloud', 'remote data loaded');
        }
      } else {
        setStorageStatus('cloud', 'ready to sync');
      }

      save();
    } catch (error) {
      console.error('Could not connect to remote storage:', error);
      remoteReady = false;
      setStorageStatus('local', 'offline / not configured');
    }
  }

  async function loadRemoteData() {
    try {
      const response = await fetch('./recipes.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = await response.json();
      return normalizeRecipeData(payload);
    } catch (e) {
      return null;
    }
  }

  async function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state.recipes = [];
        state.categories = [];
      } else {
        const parsed = JSON.parse(raw);
        const normalized = normalizeRecipeData(parsed);
        state.recipes = normalized.recipes;
        state.categories = normalized.categories;
      }
    } catch (e) {
      console.error('Could not load recipe box data:', e);
      state.recipes = [];
      state.categories = [];
    }

    if (!state.recipes.length) {
      const remoteData = await loadRemoteData();
      if (remoteData) {
        state.recipes = remoteData.recipes;
        state.categories = remoteData.categories;
      }
    }

    if (!state.activeId && state.recipes.length) {
      state.activeId = state.recipes[0].id;
    }

    await initRemoteStorage();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        recipes: state.recipes,
        categories: state.categories
      }));

      if (remoteReady && remoteDocRef) {
        remoteDocRef.set({
          recipes: state.recipes,
          categories: state.categories,
          updatedAt: Date.now()
        }).catch((error) => {
          console.error('Could not sync to remote storage:', error);
        });
      }
    } catch (e) {
      console.error('Could not save recipe box data:', e);
      showToast('Could not save - your browser storage may be full or disabled.', 'error');
    }
  }

  function exportRecipes() {
    const payload = {
      recipes: state.recipes,
      categories: state.categories,
      exportedAt: new Date().toISOString()
    };
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipes.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported recipes.json. Commit it to GitHub to publish.', 'success');
  }

  function importRecipes(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        const normalized = normalizeRecipeData(imported);

        state.recipes = normalized.recipes;
        state.categories = normalized.categories;
        state.activeId = state.recipes.length ? state.recipes[0].id : null;
        state.filter = '';
        state.activeTag = 'All';
        save();
        state.formMode = null;
        render();
        showToast('Recipes imported successfully.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Could not import recipes. Please select a valid JSON file.', 'error');
      }
    };
    reader.onerror = () => {
      showToast('Could not read the selected file.', 'error');
    };
    reader.readAsText(file);
  }

  function resetRecipes() {
    if (!confirm('Delete all recipes and reset the box?')) return;
    state.recipes = [];
    state.activeId = null;
    state.filter = '';
    state.activeTag = 'All';
    save();
    render();
    showToast('Recipe box reset.', 'success');
  }

  function uid() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function fmtAmount(n) {
    if (n === null || n === undefined || n === '') return '';
    const rounded = Math.round(n * 100) / 100;
    return rounded % 1 === 0 ? String(rounded) : String(rounded);
  }

  let toastTimer = null;
  function showToast(message, type = 'default') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    container.innerHTML = `<div class="toast toast-${type}">${esc(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { container.innerHTML = ''; }, 3200);
  }

  function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
      menu.style.display = 'none';
      menu.innerHTML = '';
    }
  }

  function showContextMenu(items, x, y) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    hideContextMenu();
    menu.innerHTML = items.map(item => `
      <div class="context-menu-item ${item.disabled ? 'disabled' : ''}" data-action="${item.actionKey || ''}">${esc(item.label)}</div>
    `).join('');
    menu.style.display = 'block';
    menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - (items.length * 36) - 20)}px`;

    menu.querySelectorAll('.context-menu-item').forEach((el, index) => {
      if (items[index].disabled) return;
      el.addEventListener('click', () => {
        hideContextMenu();
        items[index].action();
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) hideContextMenu();
    if (!e.target.closest('.modal-card') && !e.target.closest('.btn-new') && !e.target.closest('.btn-secondary')) hideModal();
  });
  document.addEventListener('scroll', hideContextMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
      hideModal();
    }
  });

  function showModal({ title, message, placeholder = '', confirmLabel = 'Create', onConfirm }) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const inputEl = document.getElementById('modalInput');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const closeBtn = document.getElementById('modalCloseBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    titleEl.textContent = title;
    msgEl.textContent = message;
    inputEl.value = '';
    inputEl.placeholder = placeholder;
    confirmBtn.textContent = confirmLabel;
    overlay.hidden = false;
    overlay.style.display = 'grid';
    inputEl.focus();

    function cleanup() {
      confirmBtn.removeEventListener('click', handleConfirm);
      closeBtn.removeEventListener('click', hideModal);
      cancelBtn.removeEventListener('click', hideModal);
      inputEl.removeEventListener('keydown', handleKeydown);
      overlay.removeEventListener('click', handleOverlayClick);
    }

    function handleConfirm() {
      const value = inputEl.value.trim();
      if (!value) {
        showToast('Please enter a name.', 'error');
        return;
      }
      cleanup();
      hideModal();
      onConfirm(value);
    }

    function handleKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    }

    function handleOverlayClick(e) {
      if (e.target === overlay) {
        cleanup();
        hideModal();
      }
    }

    confirmBtn.addEventListener('click', handleConfirm);
    closeBtn.addEventListener('click', () => {
      cleanup();
      hideModal();
    });
    cancelBtn.addEventListener('click', () => {
      cleanup();
      hideModal();
    });
    inputEl.addEventListener('keydown', handleKeydown);
    overlay.addEventListener('click', handleOverlayClick);
  }

  function hideModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.style.display = 'none';
    }
  }

  // ---------- Categories / tabs ----------
  function getCategories() {
    const cats = {};
    state.categories.forEach(c => {
      cats[c] = cats[c] || 0;
    });
    state.recipes.forEach(r => {
      const c = r.category || 'Uncategorized';
      cats[c] = (cats[c] || 0) + 1;
    });
    return cats;
  }

  function addCategory(name, showMessages = true) {
    const label = String(name || '').trim();
    if (!label) {
      if (showMessages) showToast('Enter a category name first.', 'error');
      return false;
    }
    if (state.categories.includes(label)) {
      if (showMessages) showToast(`Category "${label}" already exists.`, 'error');
      return false;
    }
    state.categories.push(label);
    save();
    if (showMessages) showToast(`Category "${label}" created.`, 'success');
    return true;
  }

  function isCustomCategory(cat) {
    return state.categories.includes(cat);
  }

  function deleteCategory(cat) {
    if (!isCustomCategory(cat)) return;
    if (!confirm(`Delete category "${cat}"? Recipes in this category will become Uncategorized.`)) return;
    state.categories = state.categories.filter(c => c !== cat);
    state.recipes.forEach(r => {
      if ((r.category || 'Uncategorized') === cat) {
        r.category = 'Uncategorized';
      }
    });
    if (state.activeTag === cat) state.activeTag = 'All';
    save();
    render();
    showToast(`Category "${cat}" deleted.`, 'success');
  }

  function renderTabs() {
    const tabList = document.getElementById('tabList');
    const cats = getCategories();
    const catNames = Object.keys(cats).sort();
    let html = '';
    const totalCount = state.recipes.length;
    html += `<div class="tab-item ${state.activeTag==='All'?'active':''}" data-cat="All" tabindex="0">
      <span>All Recipes</span><span class="count">${totalCount}</span></div>`;
    catNames.forEach(c => {
      html += `<div class="tab-item ${state.activeTag===c?'active':''}" data-cat="${esc(c)}" tabindex="0">
        <span>${esc(c)}</span><span class="count">${cats[c]}</span></div>`;
    });
    tabList.innerHTML = html;
    tabList.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', () => {
        state.activeTag = el.dataset.cat;
        const list = getFilteredRecipes();
        if (list.length && !list.find(r => r.id === state.activeId)) {
          state.activeId = list[0].id;
        }
        render();
      });

      el.addEventListener('contextmenu', (e) => {
        const category = el.dataset.cat;
        e.preventDefault();
        const items = [];
        if (category === 'All' || category === 'Uncategorized') {
          items.push({ label: 'No actions available', action: () => {}, disabled: true });
        } else {
          items.push({
            label: `Delete category "${category}"`,
            action: () => deleteCategory(category),
            disabled: !isCustomCategory(category)
          });
        }
        showContextMenu(items, e.pageX, e.pageY);
      });
    });
  }

  function getFilteredRecipes() {
    let list = state.recipes;
    if (state.activeTag !== 'All') {
      list = list.filter(r => (r.category || 'Uncategorized') === state.activeTag);
    }
    if (state.filter.trim()) {
      const q = state.filter.trim().toLowerCase();
      list = list.filter(r => {
        const inTitle = r.title.toLowerCase().includes(q);
        const inIngredients = (r.ingredients || []).some(i => i.name.toLowerCase().includes(q));
        const inTags = (r.tags || []).some(t => t.toLowerCase().includes(q));
        return inTitle || inIngredients || inTags;
      });
    }
    return list;
  }

  function updateRecipeNav(list) {
    const prevBtn = document.getElementById('prevRecipeBtn');
    const nextBtn = document.getElementById('nextRecipeBtn');
    if (!prevBtn || !nextBtn) return;

    if (state.formMode || list.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      return;
    }

    const currentIndex = list.findIndex(r => r.id === state.activeId);
    if (currentIndex === -1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      return;
    }

    prevBtn.style.display = 'block';
    nextBtn.style.display = 'block';
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === list.length - 1;
    prevBtn.style.opacity = currentIndex === 0 ? '0.4' : '1';
    nextBtn.style.opacity = currentIndex === list.length - 1 ? '0.4' : '1';
  }

  function renderRecipeCounter(currentIndex, total) {
    return `<div class="recipe-counter">Recipe ${currentIndex + 1} of ${total}</div>`;
  }

  function moveRecipe(direction) {
    const list = getFilteredRecipes();
    if (!list.length) return;
    const currentIndex = list.findIndex(r => r.id === state.activeId);
    if (currentIndex === -1) return;
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= list.length) return;
    state.activeId = list[newIndex].id;
    render();
  }

  // ---------- Main stage rendering ----------
  function renderStage() {
    const stage = document.getElementById('stageInner');
    const list = getFilteredRecipes();

    if (state.formMode) {
      stage.innerHTML = renderForm(state.formMode === 'edit' ? state.recipes.find(r => r.id === state.activeId) : null);
      wireFormEvents();
      return;
    }

    if (!list.length) {
      if (!state.recipes.length && !state.filter.trim() && state.activeTag === 'All') {
        stage.innerHTML = `
          <div class="empty-state onboard-state">
            <div class="mark">Welcome to Daniel's Recipes</div>
            <p>Start by adding your first recipe and it will be saved automatically.</p>
            <button class="btn-primary" id="onboardAddBtn">Add your first recipe</button>
          </div>`;
        document.getElementById('onboardAddBtn').addEventListener('click', () => {
          state.formMode = 'new';
          renderStage();
        });
        return;
      }

      stage.innerHTML = `
        <div class="empty-state">
          <div class="mark">${state.filter.trim() || state.activeTag !== 'All' ? 'No recipes match' : 'The box is empty'}</div>
          <p>${state.filter.trim() || state.activeTag !== 'All'
            ? 'Try a different search term or category.'
            : 'Add your first recipe and start building your collection.'}</p>
        </div>`;
      return;
    }

    if (!list.find(r => r.id === state.activeId)) {
      state.activeId = list[0].id;
    }
    const r = list.find(r => r.id === state.activeId) || list[0];
    stage.innerHTML = `
      ${state.activeTag === 'All' ? renderRecipeCounter(list.findIndex(x => x.id === r.id), list.length) : ''}
      ${renderCard(r)}`;
    wireCardEvents(r);
    wireCardContextMenu(r);
    updateRecipeNav(list);
  }

  function renderCard(r) {
    const servings = r.currentServings || r.baseServings || 1;
    const scale = servings / (r.baseServings || 1);

    const ingredientsHtml = (r.ingredients || []).map(ing => {
      const amt = ing.amount != null ? fmtAmount(ing.amount * scale) : '';
      const unit = ing.unit ? ' ' + ing.unit : '';
      return `<li><span class="amt">${esc(amt)}${esc(unit)}</span><span>${esc(ing.name)}</span></li>`;
    }).join('');

    const stepsHtml = (r.steps || []).map(s => `<li>${esc(s)}</li>`).join('');
    const tagsHtml = (r.tags || []).map(t => `<span class="tag-pill">${esc(t)}</span>`).join('');

    return `
      <div class="card">
        <div class="card-top">
          <div>
            <h2 class="card-title">${esc(r.title)}</h2>
            ${r.description ? `<p class="card-desc">${esc(r.description)}</p>` : ''}
          </div>
          <div class="card-actions">
            <button class="icon-btn" id="editBtn" title="Edit recipe">✎</button>
            <button class="icon-btn danger" id="deleteBtn" title="Delete recipe">✕</button>
          </div>
        </div>

        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Servings</span>
            <div class="servings-control">
              <button id="servDown">-</button>
              <span class="meta-value" id="servValue">${servings}</span>
              <button id="servUp">+</button>
            </div>
          </div>
          ${r.prepTime ? `<div class="meta-item"><span class="meta-label">Prep</span><span class="meta-value">${esc(r.prepTime)}</span></div>` : ''}
          ${r.cookTime ? `<div class="meta-item"><span class="meta-label">Cook</span><span class="meta-value">${esc(r.cookTime)}</span></div>` : ''}
          <div class="meta-item">
            <span class="meta-label">Category</span>
            <span class="meta-value">${esc(r.category || 'Uncategorized')}</span>
          </div>
        </div>

        ${tagsHtml ? `<div class="tags-row">${tagsHtml}</div>` : ''}

        <div class="section-label">Ingredients</div>
        <ul class="ingredients-list">${ingredientsHtml}</ul>

        <div class="section-label">Method</div>
        <ol class="steps-list">${stepsHtml}</ol>

        ${r.notes ? `<div class="notes-block">${esc(r.notes)}</div>` : ''}
      </div>
    `;
  }

  function wireCardEvents(r) {
    document.getElementById('servUp').addEventListener('click', () => {
      r.currentServings = (r.currentServings || r.baseServings || 1) + 1;
      renderStage();
    });
    document.getElementById('servDown').addEventListener('click', () => {
      const cur = r.currentServings || r.baseServings || 1;
      if (cur > 1) {
        r.currentServings = cur - 1;
        renderStage();
      }
    });
    document.getElementById('editBtn').addEventListener('click', () => {
      state.formMode = 'edit';
      renderStage();
    });
    document.getElementById('deleteBtn').addEventListener('click', () => {
      if (confirm(`Delete "${r.title}"? This can't be undone.`)) {
        state.recipes = state.recipes.filter(x => x.id !== r.id);
        save();
        state.activeId = state.recipes.length ? state.recipes[0].id : null;
        render();
      }
    });
  }

  function wireCardContextMenu(r) {
    const card = document.querySelector('.card');
    if (!card) return;
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu([
        {
          label: `Delete recipe "${r.title}"`,
          action: () => {
            if (confirm(`Delete "${r.title}"? This can't be undone.`)) {
              state.recipes = state.recipes.filter(x => x.id !== r.id);
              state.activeId = state.recipes.length ? state.recipes[0].id : null;
              save();
              render();
            }
          },
          disabled: false
        }
      ], e.pageX, e.pageY);
    });
  }

  // ---------- Form (add / edit) ----------
  function renderForm(existing) {
    const r = existing || {
      id: null, title: '', description: '', category: '', tags: [],
      baseServings: 4, prepTime: '', cookTime: '',
      ingredients: [{ amount: '', unit: '', name: '' }],
      steps: [''], notes: ''
    };

    const ingredientRows = (r.ingredients.length ? r.ingredients : [{amount:'',unit:'',name:''}]).map((ing, i) => `
      <div class="dyn-row" data-ing-row="${i}">
        <input type="number" step="any" class="amt-input" placeholder="Amt" value="${ing.amount ?? ''}" data-field="amount">
        <input type="text" class="unit-input" placeholder="Unit" value="${esc(ing.unit || '')}" data-field="unit">
        <input type="text" placeholder="Ingredient name" value="${esc(ing.name || '')}" data-field="name">
        <button type="button" class="remove-row" data-remove-ing="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    const stepRows = (r.steps.length ? r.steps : ['']).map((s, i) => `
      <div class="dyn-row" data-step-row="${i}">
        <input type="text" placeholder="Step ${i+1}" value="${esc(s)}" data-field="step">
        <button type="button" class="remove-row" data-remove-step="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    return `
      <div class="form-card">
        <h2>${existing ? 'Edit Recipe' : 'New Recipe'}</h2>
        <form id="recipeForm">
          <div class="field">
            <label>Title</label>
            <input type="text" id="f_title" value="${esc(r.title)}" required placeholder="e.g. Sunday Morning Pancakes">
          </div>
          <div class="field">
            <label>Description</label>
            <textarea id="f_description" placeholder="A short line about this recipe">${esc(r.description)}</textarea>
          </div>
          <div class="row-2">
            <div class="field">
              <label>Category</label>
              <select id="f_category">
                <option value="Uncategorized">Uncategorized</option>
                ${state.categories.slice().sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
                <option value="__new__">+ Add new category</option>
              </select>
              <div class="field" id="newCategoryRow" style="display:none; margin-top:10px;">
                <input type="text" id="f_category_new" placeholder="New category name">
              </div>
            </div>
            <div class="field">
              <label>Tags (comma separated)</label>
              <input type="text" id="f_tags" value="${esc((r.tags||[]).join(', '))}" placeholder="quick, vegetarian">
            </div>
          </div>
          <div class="row-2">
            <div class="field">
              <label>Prep time</label>
              <input type="text" id="f_prep" value="${esc(r.prepTime)}" placeholder="10 min">
            </div>
            <div class="field">
              <label>Cook time</label>
              <input type="text" id="f_cook" value="${esc(r.cookTime)}" placeholder="20 min">
            </div>
          </div>
          <div class="field">
            <label>Base servings</label>
            <input type="number" min="1" id="f_servings" value="${r.baseServings || 4}" style="width:100px">
          </div>

          <div class="field">
            <label>Ingredients</label>
            <div class="dyn-list" id="ingredientsList">${ingredientRows}</div>
            <button type="button" class="add-row-btn" id="addIngredientBtn">+ Add ingredient</button>
          </div>

          <div class="field">
            <label>Method</label>
            <div class="dyn-list" id="stepsList">${stepRows}</div>
            <button type="button" class="add-row-btn" id="addStepBtn">+ Add step</button>
          </div>

          <div class="field">
            <label>Notes</label>
            <textarea id="f_notes" placeholder="Variations, storage tips, anything worth remembering">${esc(r.notes)}</textarea>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">${existing ? 'Save changes' : 'Add to box'}</button>
            <button type="button" class="btn-secondary" id="cancelFormBtn">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  function wireFormEvents() {
    const editingExisting = state.formMode === 'edit';
    const original = editingExisting ? state.recipes.find(r => r.id === state.activeId) : null;

    document.getElementById('addIngredientBtn').addEventListener('click', () => {
      addDynRow('ingredientsList', `
        <input type="number" step="any" class="amt-input" placeholder="Amt" data-field="amount">
        <input type="text" class="unit-input" placeholder="Unit" data-field="unit">
        <input type="text" placeholder="Ingredient name" data-field="name">
        <button type="button" class="remove-row" title="Remove">✕</button>
      `);
    });

    document.getElementById('addStepBtn').addEventListener('click', () => {
      addDynRow('stepsList', `
        <input type="text" placeholder="Next step" data-field="step">
        <button type="button" class="remove-row" title="Remove">✕</button>
      `);
    });

    document.getElementById('f_category')?.addEventListener('change', () => {
      const newRow = document.getElementById('newCategoryRow');
      if (!newRow) return;
      if (document.getElementById('f_category').value === '__new__') {
        newRow.style.display = 'block';
        document.getElementById('f_category_new').focus();
      } else {
        newRow.style.display = 'none';
      }
    });

    function addDynRow(containerId, innerHtml) {
      const container = document.getElementById(containerId);
      const row = document.createElement('div');
      row.className = 'dyn-row';
      row.innerHTML = innerHtml;
      row.querySelector('.remove-row').addEventListener('click', () => row.remove());
      container.appendChild(row);
    }

    document.querySelectorAll('.remove-row').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.dyn-row').remove());
    });

    document.getElementById('cancelFormBtn').addEventListener('click', () => {
      state.formMode = null;
      renderStage();
    });

    document.getElementById('recipeForm').addEventListener('submit', (e) => {
      e.preventDefault();

      const ingredients = Array.from(document.querySelectorAll('#ingredientsList .dyn-row')).map(row => {
        const amount = row.querySelector('[data-field="amount"]').value;
        const unit = row.querySelector('[data-field="unit"]').value.trim();
        const name = row.querySelector('[data-field="name"]').value.trim();
        return { amount: amount === '' ? null : parseFloat(amount), unit, name };
      }).filter(i => i.name);

      const steps = Array.from(document.querySelectorAll('#stepsList .dyn-row')).map(row => {
        return row.querySelector('[data-field="step"]').value.trim();
      }).filter(s => s);

      const tags = document.getElementById('f_tags').value
        .split(',').map(t => t.trim()).filter(Boolean);

      let category = document.getElementById('f_category').value;
      if (category === '__new__') {
        category = document.getElementById('f_category_new').value.trim() || 'Uncategorized';
      }
      if (category && category !== 'Uncategorized' && !state.categories.includes(category)) {
        state.categories.push(category);
      }
      const data = {
        title: document.getElementById('f_title').value.trim() || 'Untitled recipe',
        description: document.getElementById('f_description').value.trim(),
        category,
        tags,
        prepTime: document.getElementById('f_prep').value.trim(),
        cookTime: document.getElementById('f_cook').value.trim(),
        baseServings: parseInt(document.getElementById('f_servings').value, 10) || 1,
        ingredients,
        steps,
        notes: document.getElementById('f_notes').value.trim()
      };

      if (editingExisting && original) {
        Object.assign(original, data);
        original.currentServings = null;
        state.activeId = original.id;
      } else {
        const newRecipe = Object.assign({ id: uid(), currentServings: null }, data);
        state.recipes.push(newRecipe);
        state.activeId = newRecipe.id;
      }

      save();
      state.formMode = null;
      render();
    });
  }

  // ---------- Global wiring ----------
  function render() {
    renderTabs();
    renderStage();
  }

  document.getElementById('newRecipeBtn').addEventListener('click', () => {
    state.formMode = 'new';
    renderStage();
  });

  document.getElementById('prevRecipeBtn')?.addEventListener('click', () => moveRecipe('prev'));
  document.getElementById('nextRecipeBtn')?.addEventListener('click', () => moveRecipe('next'));

  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    showModal({
      title: 'Add Category',
      message: 'Enter a category name to create it in the recipe box.',
      placeholder: 'e.g. Stew',
      confirmLabel: 'Create',
      onConfirm: (name) => {
        if (addCategory(name)) {
          renderTabs();
        }
      }
    });
  });

  document.getElementById('exportBtn').addEventListener('click', exportRecipes);
  document.getElementById('syncCloudBtn')?.addEventListener('click', () => {
    if (remoteReady && remoteDocRef) {
      save();
      showToast('Recipe box synced to cloud.', 'success');
    } else {
      showToast('Cloud sync is not ready yet. Configure Firebase first.', 'error');
    }
  });
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importRecipes(file);
    }
    e.target.value = '';
  });
  document.getElementById('resetBtn').addEventListener('click', resetRecipes);

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.filter = e.target.value;
    render();
  });

  load().then(() => render());
})();
