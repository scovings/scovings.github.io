(function(){
  const STORAGE_KEY = 'recipeBoxData_v1';

  let state = { recipes: [], activeId: null, filter: '', activeTag: 'All' };

  function load() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      state.recipes = [];
    } catch (e) {
      console.error('Could not clear recipe box data:', e);
      state.recipes = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recipes));
    } catch (e) {
      console.error('Could not save recipe box data:', e);
      alert('Could not save - your browser storage may be full or disabled.');
    }
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

  // ---------- Categories / tabs ----------
  function getCategories() {
    const cats = {};
    state.recipes.forEach(r => {
      const c = r.category || 'Uncategorized';
      cats[c] = (cats[c] || 0) + 1;
    });
    return cats;
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
      stage.innerHTML = `
        <div class="empty-state">
          <div class="mark">${state.filter || state.activeTag !== 'All' ? 'No recipes match' : 'The box is empty'}</div>
          <p>${state.filter || state.activeTag !== 'All'
            ? 'Try a different search term or category.'
            : 'Add your first recipe and start building your collection.'}</p>
        </div>`;
      return;
    }

    if (!list.find(r => r.id === state.activeId)) {
      state.activeId = list[0].id;
    }
    const r = list.find(r => r.id === state.activeId) || list[0];
    stage.innerHTML = renderCard(r);
    wireCardEvents(r);
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
              <input type="text" id="f_category" value="${esc(r.category)}" placeholder="e.g. Dinner">
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

      const data = {
        title: document.getElementById('f_title').value.trim() || 'Untitled recipe',
        description: document.getElementById('f_description').value.trim(),
        category: document.getElementById('f_category').value.trim() || 'Uncategorized',
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

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.filter = e.target.value;
    render();
  });

  load();
  render();
})();
